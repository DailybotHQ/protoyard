import type { PrototypeRuntime } from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import type { CrmDatabase } from '../../../prototypes/crm-demo/src/database/schema.ts';
import { CAPABILITIES } from '../../../prototypes/crm-demo/src/domain/policy.ts';
import {
  createCrmServices,
  type DealInput,
} from '../../../prototypes/crm-demo/src/domain/services.ts';
import { definition } from '../../../prototypes/crm-demo/src/prototype.ts';
import { createMockApi, HttpError, json, MockResponse } from '../src/index.ts';

/** The README example, verbatim apart from getRuntime(): keeps the docs honest. */
function crmApi(runtime: PrototypeRuntime<CrmDatabase>) {
  const crm = createCrmServices(runtime);
  return createMockApi<CrmDatabase>(runtime, {
    baseUrl: '/api',
    routes: {
      'GET /deals': async ({ runtime, query }) => {
        runtime.session.assert(CAPABILITIES.companiesRead);
        const stage = query.get('stage');
        const limit = Math.min(Number(query.get('limit') ?? 50), 200);
        const all = await runtime.db.deals.orderBy('createdAt').reverse().toArray();
        const items = stage ? all.filter((deal) => deal.stage === stage) : all;
        return { items: items.slice(0, limit), total: items.length };
      },
      'GET /deals/:id': async ({ runtime, params }) => {
        const deal = await runtime.db.deals.get(params.id ?? '');
        if (!deal) throw new HttpError(404, `Deal ${params.id} not found`);
        return deal;
      },
      'POST /deals': async ({ body }) => {
        const deal = await crm.deals.create(body as DealInput);
        return json(deal, { status: 201, headers: { location: `/api/deals/${deal.id}` } });
      },
    },
    mapError: (error) =>
      error instanceof Error && error.name === 'PaywallError'
        ? new MockResponse(402, { error: 'payment_required', message: error.message })
        : undefined,
  });
}

const open: PrototypeRuntime[] = [];
afterEach(() => {
  for (const rt of open.splice(0)) rt.close();
});
async function boot(scenario: string) {
  const runtime = (await createPrototypeRuntime(definition, {
    indexedDB: new IDBFactory() as unknown as globalThis.IDBFactory,
    IDBKeyRange,
    link: { scenario },
    sleep: async () => {},
  })) as unknown as PrototypeRuntime<CrmDatabase>;
  await runtime.scenarios.ensureSeeded();
  open.push(runtime as PrototypeRuntime);
  return runtime;
}
const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('README example over crm-demo services', () => {
  it('lists, reads and creates deals with real statuses', async () => {
    const runtime = await boot('growing-team');
    const api = crmApi(runtime);
    const list = (await (await api.fetch('/api/deals?stage=lead&limit=5')).json()) as {
      items: { id: string; stage: string }[];
      total: number;
    };
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.items.every((d) => d.stage === 'lead')).toBe(true);
    expect((await api.fetch(`/api/deals/${list.items[0]?.id}`)).status).toBe(200);
    expect((await api.fetch('/api/deals/deal_missing')).status).toBe(404);

    const company = (await runtime.db.companies.toArray())[0];
    const created = await api.fetch(
      '/api/deals',
      post({ title: 'API pilot', companyId: company?.id, amount: 5000, closeDate: '2026-12-01' })
    );
    expect(created.status).toBe(201);
    expect(created.headers.get('location')).toMatch(/^\/api\/deals\/deal_u/);

    const invalid = await api.fetch('/api/deals', post({ title: 'x' }));
    expect(invalid.status).toBe(422);
    expect(((await invalid.json()) as { issues: Record<string, string> }).issues).toHaveProperty(
      'title'
    );
  });

  it('returns 403 for the viewer and 402 for an expired trial', async () => {
    const viewer = crmApi(await boot('viewer-view'));
    expect(
      (
        await viewer.fetch(
          '/api/deals',
          post({
            title: 'Nope deal',
            companyId: 'company_0001',
            amount: 1,
            closeDate: '2026-12-01',
          })
        )
      ).status
    ).toBe(403);
    const expired = await boot('trial-expired');
    const company = (await expired.db.companies.toArray())[0];
    const paywalled = await crmApi(expired).fetch(
      '/api/deals',
      post({ title: 'Paywalled', companyId: company?.id, amount: 1, closeDate: '2026-12-01' })
    );
    expect(paywalled.status).toBe(402);
  });
});
