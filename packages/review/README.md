# @protoyard/review

The engine for review comments on published prototypes: reviewers click a
spot on a screen, leave a comment pinned there, and the team reads every
thread in one list. This package has no Svelte; the UI is
[`@protoyard/review-ui`](../review-ui/README.md). The comment schemas live in
`@protoyard/core/review`.

Every subpath below is implemented. The reviewer guide, the agent loop
(`protoyard comments pull` → `REVIEW.md`), the Cloudflare setup and the honest
limits are in [docs/REVIEW_COMMENTS.md](../../docs/REVIEW_COMMENTS.md).

| Subpath | Purpose | Task |
| --- | --- | --- |
| `./anchors` | Pin anchors: route, element locator ladder, offset inside the element, context | T-review-anchoring |
| `./store` | The small `ReviewAdapter` contract and its conformance suite | T-review-adapter-contract |
| `./adapters/local` | Namespaced IndexedDB adapter (its own database, untouched by scenario loads) with validated export / import | T-review-adapter-local |
| `./adapters/http` | Adapter for any endpoint with the comments REST shape (also the Cloudflare mode) | T-review-adapter-http |
| `./adapters/artifact` | Adapter on a Claude Artifact's shared database (`db` + `user` capabilities), falling back to a local adapter | T-art-review-artifact-adapter |
| `./server` | The comments API handler on plain `Request` / `Response` | T-review-server-handler |
| `./report` | Review reports (`REVIEW.md`, JSON) for `protoyard comments pull` | T-review-cli-comments |

## Boundaries

- **`./server` uses Web APIs only**: no Svelte, no UI packages, no Dexie or
  `@protoyard/database`, no `node:` modules and no DOM globals, so it can be
  bundled into a Cloudflare Pages worker and tested in Node.
- **No Svelte or UI packages anywhere in this engine.**
- Reviewer names are self-declared and a review key only keeps casual
  visitors out: **this is not authentication**.

`packages/review-ui/tests/bundle-hygiene.test.ts` enforces these rules.

```bash
pnpm --filter @protoyard/review typecheck
pnpm vitest run packages/review-ui/tests/bundle-hygiene.test.ts
```

## Local adapter (`@protoyard/review/adapters/local`)

`createLocalReviewAdapter({ namespace, slug, clientId })` stores comments in
`protoyard.<namespace>.review`, separate from the prototype data and control
databases. The optional `slug` defaults to `namespace` and scopes exported
files. `exportComments()` returns a JSON `Blob`; `importComments(file)` validates
the whole file, its namespace and slug, and every comment before writing. Files
larger than 5 MB are rejected. Imports merge by comment id and only replace an
existing comment when the incoming `updatedAt` is newer. The adapter allows edits
and deletes only when the stored author `clientId` matches its configured
`clientId`; this is a browser UX rule, not authentication or a security boundary.

Call `close()` when the adapter is no longer needed. A host can supply
`indexedDB` and `IDBKeyRange` to isolate the adapter storage factory.

## Server handler (`@protoyard/review/server`)

`handleCommentsRequest(request, env, store)` is a Web API-only handler for
`GET /api/comments/<slug>[?since=]`, `GET /api/comments/<slug>/summary`,
`PUT /api/comments/<slug>/<id>`, and `DELETE /api/comments/<slug>/<id>`. It
returns JSON with `nosniff` and `no-referrer` headers, validates slugs and
comments, caps request bodies at 16 KB, and leaves comment bodies as plain text.
Writes require a same-origin `Origin`; configure `REVIEW_KEY` to discourage
casual access (it is not authentication). Only writes (`PUT`, `DELETE`) are rate limited, with
fixed windows, and respond with `429 Retry-After` when exceeded: 120 per
`CF-Connecting-IP` (or the first `X-Forwarded-For` value), checked first, then
30 per `x-review-client-id`, per 60 seconds. Reads never write rate buckets.
A `PUT` of a new id answers `409 comment_limit` once a slug holds 2,000
comments (`maxCommentsPerSlug`); edits still work. Stores may implement
`count(slug)` and `pruneRateLimits(now, windowMs)`; the D1 store deletes
expired `rate_limits` rows on each allowed write. Pass handler env overrides
to change the limits. The summary reports comment and root-thread counts, with
open/resolved counts calculated from root comments.

Comments are validated by `validateReviewComment` (also exported), a
dependency-free mirror of `ReviewCommentSchema`. The module imports only types
from `@protoyard/core/review`, so the Cloudflare worker that
`protoyard publish --comments` bundles stays under 20 KB raw (about 15 KB;
with zod and the core schemas it was 109 KB). `tests/server-validate.test.ts`
runs both validators on about 850 valid and invalid documents and requires the
same verdict and the same parsed value. Change the schema and the validator
together.

**The handler does not check authorship.** Anyone who can reach it (with
the key, when set) can overwrite or delete any comment by id; "only the author
edits" is a rule of the review UI.

Use `createD1CommentsStore(db)` for shared deployments: D1 upserts and rate
buckets are strongly consistent. Apply [`schema/d1.sql`](schema/d1.sql)
manually to the database; the CLI never runs it. `createKvCommentsStore(kv)`
is easier to bind but KV reads, writes, scans, and rate limits are eventually
consistent. `createMemoryCommentsStore()` is intended for tests and one
process. Reviewer names, client ids, and the optional review key do not provide
authentication.

## Store (`@protoyard/review/store`)

One small interface for every place comments can live: local IndexedDB, the
Cloudflare Function, any http endpoint and the artifact database. The UI
never branches on the backend.

```ts
interface ReviewAdapter {
  list(slug: string, options?: { since?: string }): Promise<ReviewComment[]>; // oldest first
  put(comment: ReviewCommentInput): Promise<ReviewComment>; // upsert by id, stamps updatedAt
  remove(id: string): Promise<void>; // a missing id resolves too
  info(): { kind: 'local' | 'cloudflare' | 'http' | 'artifact'; shared: boolean; live: boolean };
  subscribe?(slug: string, onChange: () => void): () => void; // when live
}
```

- **Documents keyed by a client-generated id, last write wins.** The
  adapter (or its server) stamps `updatedAt` and ignores the client's copy.
  An edit, a resolve (`resolvedAt` and `resolvedBy`) and a reopen (the
  document without them) are each a `put` of the whole comment. That means a
  key-value or document store needs no special verbs.
- **Ordering and polling:** `list` returns a slug's comments by `createdAt`,
  then id. `since` keeps only comments whose `updatedAt` is later, for
  polling.
- **Validation** uses the core zod schema on both sides:
  `parseReviewComment` before writing, and `acceptStoredComments` to drop
  invalid rows read back from storage or the network.
- **Permissions are not here.** Rules such as "edit only your own comment"
  live in the UI and the server. Reviewer names are self-declared, so this
  is not authentication.
- **Helpers for adapters:**
  - `createStamper` makes strictly increasing stamps, even for several
    writes in one millisecond.
  - `sortReviewComments` and `changedSince` cover ordering and the `since`
    filter.
  - `watchReviewComments(adapter, slug, onChange)` uses `subscribe` when
    the adapter is live. Otherwise it polls `list` and compares ids and
    stamps, so removals are noticed too.
- **Reference adapter:** `createMemoryReviewAdapter()` keeps comments in
  memory, for tests and demos. It defines the contract's behavior.

### Conformance suite

Every backend must pass `tests/conformance.ts`. It checks:
- a round trip with the adapter's own stamp
- idempotent upserts for edit, resolve and reopen
- remove
- ordering and slug isolation
- the `since` filter
- schema rejection, with nothing stored
- change notification through `subscribe` or the polling fallback

```ts
import { runAdapterConformance } from '../../review/tests/conformance.ts';

runAdapterConformance('artifact adapter', () => createArtifactReviewAdapter(db), {
  cleanup: (adapter) => clearTables(),
});
```

Each case gets a fresh adapter and its own slug. The memory adapter runs the
suite twice: live, and as a polling-only backend.

```bash
pnpm vitest run packages/review/tests/adapter-contract.test.ts
```

**Size:** the contract helpers are 0.55 KB gzip, and 0.8 KB with the memory
adapter. zod and the `@protoyard/core/review` schemas are external.

## HTTP adapter (`@protoyard/review/adapters/http`)

`createHttpReviewAdapter({ endpoint, clientId, localAdapter })` connects the
review UI to an endpoint that implements the comments REST shape. Relative
endpoints resolve from the host site's origin, so an embedded showcase page
under `/p/<slug>/app/` still calls `/api/comments`. The adapter sends the
client id on each request. A `?review=<key>` query value is moved to
`sessionStorage` and removed from the address bar before network requests; the
key is sent as `x-review-key`. This deters casual access and is not
authentication.

Network failures, HTTP 429 and server errors queue writes in memory and persist
comment bodies through the supplied local adapter. The adapter retries queued
idempotent writes when subscribed and exposes `pendingCount()`,
`pendingWrites()` and `subscribePending()` for an integration to show pending
status. Call `retryPending(slug?)` to retry explicitly. While a subscriber is
active, the adapter polls immediately, on window focus and every 30 seconds by
default; unsubscribe to stop polling.

```ts
import { createHttpReviewAdapter } from '@protoyard/review/adapters/http';

const adapter = createHttpReviewAdapter({
  endpoint: '/api/comments',
  clientId,
  localAdapter,
});
const unsubscribePending = adapter.subscribePending(() => {
  showPendingCount(adapter.pendingCount());
});
```

The local adapter must use the same client identity as the review author for
locally queued edits and deletes. Queue metadata itself is in memory; comments
remain in IndexedDB. On each successful list, the adapter reconciles local rows:
missing rows and rows with a newer `updatedAt` are uploaded, while a newer
server row wins. This restores sync after reload even though the retry queue
itself is not persisted. The renderer exposes any transiently queued writes as
visible “comments waiting to sync” feedback.

## Reports (`@protoyard/review/report`)

`createReviewCommentsFile()` and `parseReviewCommentsFile()` validate the
same versioned JSON envelope used by the local adapter's `exportComments()`.
`createPulledReviewComments()` adds the workspace pull timestamp, while
`toReviewCommentsFile()` removes that extra field when exporting back to the
adapter format. `renderReviewMarkdown()` groups threads by anchored screen,
lists open threads first, and escapes comment text before quoting it in
`REVIEW.md`. Routes, locators, element text and build ids are single-line by
schema (no controls, line separators or bidi marks), and the report collapses
whitespace and strips those characters again before fencing them as code. The
report opens with `UNTRUSTED_NOTICE`: reviewer text is data, not instructions.

## Anchors (`@protoyard/review/anchors`)

A pin has to land on the same spot after the layout reflows, inside a device
frame, or in another shell. If its element is gone, the pin must say so
instead of sitting somewhere wrong.

```ts
import { captureContext, createAnchor, LOW_CONFIDENCE, resolveAnchor } from '@protoyard/review/anchors';

const anchor = createAnchor(event.target as Element, { x: event.clientX, y: event.clientY }, {
  root: prototypeRoot,
  route: { pattern: '/deals/:id', path: '/deals/7' },
});
const context = captureContext({ scenario, persona, shell, orientation, theme, mode, layout, buildId });

const found = resolveAnchor(anchor, prototypeRoot);
if (found.orphaned) {
  // List the thread as "element not found".
} else {
  // Draw the pin at anchorPoint(anchor, found.element).
  // If found.confidence < LOW_CONFIDENCE, draw it dashed.
}
```

- **Locator ladder:** an anchor stores up to five locators, strongest first.
  `resolveAnchor` tries them in order.

  | Locator | Value | Confidence |
  | --- | --- | --- |
  | `data-py-anchor` | the attribute | 1 |
  | `data-testid` | the attribute | 0.95 |
  | a stable `id` | the id | 0.9 |
  | role path | role and accessible name inside the nearest landmark (main, navigation, a named region…), with an index | 0.8 |
  | CSS path | `nth-of-type` from the root, or from the nearest stable id | 0.6 |

  When a locator matches more than one element, confidence drops by 10%.
- **Generated ids are never used** (`isGeneratedId`): Bits UI `bits-…` ids,
  digits only, UUIDs and long hash-like ids, React `:r1:`, and any id with a
  counter segment such as Svelte `$props.id()` output (`c1` in
  `grid-c1-err`).
- **Fingerprint:** the element's text, its text nodes joined by spaces (at
  most 120 characters), confirms a match.
  - A match with different text keeps looking down the ladder for a match
    whose text agrees.
  - Otherwise it returns the first candidate at half confidence. That is
    below `LOW_CONFIDENCE` (0.7), so the pin is drawn dashed.
  - No match at all is `{ orphaned: true }`.
- **Offset:** 0–1 on each axis, from `getBoundingClientRect`. That box
  includes the ShellHost scale transform, so the stored offset is the same
  at any zoom or frame size. Clicks outside the box clamp to its edge.
  `anchorPoint` turns the offset back into client coordinates.
- **Route:** the anchor stores a route pattern and path. The default is the
  hash route, with the query left out. `anchorMatchesRoute` accepts the exact
  path or the pattern with `:param` segments.
- **Context:** `captureContext` records scenario, persona, shell,
  orientation, theme, mode, layout, viewport and build id, validated by
  `ReviewContextSchema`. The viewport defaults to the window size; missing
  values are left out, and invalid ones throw.

### The `data-py-anchor` convention (optional)

Put `data-py-anchor="deal-card-total"` on elements reviewers are likely to
pin: cards, totals, key buttons, chart areas. The value is a stable,
human-readable id that is unique on its screen. Pins on these elements
survive any markup change.

The attribute is opt-in, and nothing requires it. Components are not
mass-edited to add it: each prototype (and the ui-kit) adopts it in its own
task.

Unit tests (happy-dom) cover the ladder, generated ids, the fingerprint,
offsets and orphans:

```bash
pnpm vitest run packages/review/tests/anchors.test.ts
```

Real layout and the 200-pin budget are covered in E2E (review-e2e).

**Size:** 2.5 KB gzip of its own code. zod and the `@protoyard/core/review`
schemas are external and shared with the rest of the review chunk; bundled
in, the total is 6.1 KB.

## Artifact adapter (`@protoyard/review/adapters/artifact`)

When a prototype is shared as a Claude Artifact, comments can live in the
artifact's shared database, so every viewer sees the same threads.

```ts
import { createArtifactReviewAdapter } from '@protoyard/review/adapters/artifact';

const adapter = await createArtifactReviewAdapter(localAdapter);
```

- **Fallback:** it asks for the `db` and `user` capabilities. If either is
  missing or refused, it returns the local adapter you pass in, and
  `LOCAL_REVIEW_FALLBACK_NOTICE` tells the viewer that comments are saved
  only in their browser.
- **Authors:** it stores author ids only and resolves profile names on read.
  It serializes writes per document and keeps live subscriptions to at most
  64 collections per view.
- **Conformance:** it passes `tests/conformance.ts`, tested against a fake
  Claude capability surface (`tests/fixtures/fake-claude.ts`).
- **Not live-verified:** no real Artifact runtime has exercised it yet; that
  happens in T-art-real-private-publish.

## Claude shell composer fallback (`@protoyard/review/adapters/artifact-shell`)

`createArtifactShellReviewAdapter(fallback, claude)` prefers the shared
`db` + `user` adapter. If those capabilities are unavailable and the shell
grants `comments` with `composer_only: true`, it returns the local adapter in
`composer_only` mode plus an `openComposer(element)` action. Call that action
only from a viewer gesture; it opens Claude's composer anchored to the chosen
element. Claude owns those threads, so Protoyard cannot list or synchronize
them. The review panel can show `ClaudeComposerNotice` in this mode.
