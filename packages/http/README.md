# @protoyard/http

An optional mock HTTP layer for prototypes. `createMockApi` turns your prototype's own
services into a **fetch-compatible API** that answers with real `Response` objects: status
codes, JSON, headers and errors. There is no server, no service worker and no MSW dependency.

Use it when the UI you are prototyping talks HTTP: a generated API client, code you will
later point at a real backend, or demos of loading, retry and error states.

```ts
import { createMockApi, installGlobalFetch, json, HttpError } from '@protoyard/http';

const api = createMockApi(runtime, {
  baseUrl: '/api',
  routes: {
    'GET /deals': ({ query }) => …,
    'GET /deals/:id': ({ params }) => …,
    'POST /deals': ({ body }) => json(created, { status: 201 }),
  },
});

const response = await api.fetch('/api/deals?stage=lead'); // a real Response
```

## How a request is handled

1. The URL is matched against `baseUrl` and then the route keys (`'<METHOD> /path/:param'`).
   An unknown path returns **404**. A known path with the wrong method returns **405** with
   an `Allow` header.
2. The handler receives `{ method, path, params, query, body, headers, runtime }`. `body` is
   parsed JSON (or text), and invalid JSON returns **400**.
3. The handler runs through `runtime.environment.run('http.<METHOD> <route>')` (unless the
   route is `{ handler, environment: 'services' }`, for handlers whose services already call
   `environment.run`; otherwise latency and failure rolls would apply twice), so every
   DevTools environment toggle applies to the API exactly as it does to services:
   - latency and slow network,
   - offline,
   - failure modes and `failureRate`,
   - `failureScope: ['http.']`, which fails only the API, or
     `['http.GET /deals/:id']`, which fails a single endpoint.
4. A handler's return value becomes the response:

   | Handler returns | Response |
   | --- | --- |
   | data | **200** JSON |
   | `json(data, { status, headers })` / `new MockResponse(…)` | exactly that |
   | `undefined` | **204** |

   Every response carries `x-protoyard-mock: 1`.

## Error semantics

| Thrown | Response |
| --- | --- |
| `PermissionDeniedError` (`session.assert`) | **403** `{ error: 'forbidden', capability, role }` |
| anything with `.issues` (zod errors, prototype `ValidationError`s) | **422** `{ error: 'validation_failed', issues }` |
| `new HttpError(status, message, details?)` | that status |
| simulated `timeout` | **504** |
| simulated `server-error` | **500** |
| simulated `rate-limited` | **429** with `Retry-After: 2` |
| simulated `permission-denied` | **403** |
| simulated `offline` | `fetch()` **rejects** with `TypeError('Failed to fetch')`, like a real fetch with no network |
| anything else | **500** `{ error: 'internal', message }` |

Prototype-specific errors can be mapped first with `mapError` (example below).

## Example: three endpoints over `crm-demo`'s services

This wires the existing domain services as they are. The services still do the permission
check, validation, environment and transaction, so the API stays a thin adapter.

```ts
// prototypes/crm-demo/src/lib/api.ts (example — not part of the demo)
import { getRuntime } from '@protoyard/renderer-svelte';
import { createMockApi, HttpError, json, MockResponse } from '@protoyard/http';
import type { CrmDatabase } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { createCrmServices, type DealInput } from '../domain/services.ts';

const runtime = getRuntime<CrmDatabase>();
const crm = createCrmServices(runtime);

export const api = createMockApi<CrmDatabase>(runtime, {
  baseUrl: '/api',
  routes: {
    // GET /api/deals?stage=proposal&limit=20
    'GET /deals': async ({ runtime, query }) => {
      runtime.session.assert(CAPABILITIES.companiesRead); // the demo's read capability
      const stage = query.get('stage');
      const limit = Math.min(Number(query.get('limit') ?? 50), 200);
      const all = await runtime.db.deals.orderBy('createdAt').reverse().toArray();
      const items = stage ? all.filter((deal) => deal.stage === stage) : all;
      return { items: items.slice(0, limit), total: items.length };
    },
    // GET /api/deals/deal_0007
    'GET /deals/:id': async ({ runtime, params }) => {
      const deal = await runtime.db.deals.get(params.id ?? '');
      if (!deal) throw new HttpError(404, `Deal ${params.id} not found`);
      return deal;
    },
    // POST /api/deals  { title, companyId, amount, closeDate }
    // The service already runs environment.run('deals.create', …): mark the route
    // 'services' so latency and failure rolls apply once, not twice.
    'POST /deals': {
      environment: 'services',
      handler: async ({ body }) => {
        const deal = await crm.deals.create(body as DealInput); // 403 / 422 come from the service
        return json(deal, { status: 201, headers: { location: `/api/deals/${deal.id}` } });
      },
    },
  },
  // The demo's expired-trial error becomes a real 402.
  mapError: (error) =>
    error instanceof Error && error.name === 'PaywallError'
      ? new MockResponse(402, { error: 'payment_required', message: error.message })
      : undefined,
});
```

Things to try against it:

- `fetch('/api/deals', { method: 'POST', body: '{"title":"x"}' })` returns **422**, with
  `issues.title` from `DealInputSchema`.
- In the `viewer-view` scenario, the same POST returns **403**.
- In `trial-expired`, it returns **402** through `mapError`.
- Turn on DevTools → Environment → offline, and every call rejects like a real network
  failure.

## `installGlobalFetch(api, target?)`

For code that calls `fetch('/api/…')` directly. Requests whose URL is under `baseUrl` (same
origin, matching path) go to the mock. **Everything else is passed to the original `fetch`
untouched**, including CDNs, other paths and `/apix` lookalikes. It returns `{ restore() }`.

```ts
const mock = installGlobalFetch(api);
// … app code using fetch('/api/deals') …
mock.restore();
```

## Network log for DevTools

`api.log` is a ring buffer of the last 200 requests (`logSize` to change it):

```ts
api.log.entries(); // readonly NetworkLogEntry[], oldest first
api.log.subscribe((entries) => …); // returns an unsubscribe function
api.log.clear();
```

Each entry has `{ id, at, method, url, route, status, durationMs, requestBody?,
responseBody?, error? }`:

- `at` is **simulated** time.
- `status` is `null` when the request never got a response (offline).
- Bodies are previews truncated to 2,000 characters, never live objects.

### Discovery

`createMockApi` registers itself per runtime, so DevTools can find every API without the
prototype wiring anything:

```ts
import { getMockApis, subscribeMockApis } from '@protoyard/http';
getMockApis(runtime); // readonly MockApi[] — each has baseUrl, routes, log
const off = subscribeMockApis(runtime, (apis) => …);
api.unregister(); // remove one (e.g. in tests)
```

The registry is a `WeakMap` keyed by runtime, so closed runtimes are garbage-collected.

## Layering MSW (optional)

`@protoyard/http` does not use a service worker (the optional `@protoyard/offline` one only
caches the app shell and never sees mock requests). If you want real network interception
(for example, so requests show up in the browser's Network tab), add MSW to your prototype
yourself and delegate to the mock API:

```ts
import { http } from 'msw';
import { setupWorker } from 'msw/browser';

const worker = setupWorker(http.all('/api/*', ({ request }) => api.handle(request)));
await worker.start({ onUnhandledRequest: 'bypass' });
```

`api.handle(request)` takes a standard `Request` and returns a standard `Response`, so the
routing, environment and error semantics stay identical. An offline rejection becomes
MSW's network error. You must serve MSW's worker script yourself, and remember that a
service worker is shared by every page on the origin.

## Tests

`pnpm vitest run packages/http` runs against the real runtime and fixture and covers:

- routing, params, query and bodies, 404, 405 with `Allow`, and 400 for broken JSON,
- absolute base URLs,
- every error mapping, including environment failures and offline rejection,
- `failureScope` and latency,
- `installGlobalFetch` passthrough and `restore`,
- the log ring buffer.

## Package output

The manifest keeps TypeScript source exports for workspace development. `pnpm build:packages --filter engine` creates the ESM and declaration files under `dist/` that the packed manifest exposes.
