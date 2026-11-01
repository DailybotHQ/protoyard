import { PermissionDeniedError, type PrototypeRuntime } from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { expectBootableWorld } from '../../../tests/support/smoke.ts';
import type { CrmDatabase } from '../src/database/schema.ts';
import { createCrmServices } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';

/**
 * End-to-end domain tests against the REAL runtime and an in-memory
 * IndexedDB: scenario loads, persona switches, permissions, persistence
 * across "reloads" (a second runtime on the same IndexedDB), snapshots and
 * time advance.
 */

let indexedDB: IDBFactory;
const open: PrototypeRuntime[] = [];

async function boot(scenario = 'growing-team'): Promise<PrototypeRuntime<CrmDatabase>> {
  const runtime = (await createPrototypeRuntime(definition, {
    indexedDB,
    IDBKeyRange,
    sleep: async () => {},
    link: { scenario },
  })) as unknown as PrototypeRuntime<CrmDatabase>;
  await runtime.scenarios.ensureSeeded();
  open.push(runtime);
  return runtime;
}

/** Simulates a page reload: close and reopen against the same browser storage. */
async function reload(runtime: PrototypeRuntime<CrmDatabase>) {
  runtime.close();
  return boot();
}

afterEach(() => {
  for (const runtime of open.splice(0)) runtime.close();
});

const fresh = () => {
  indexedDB = new IDBFactory();
};

describe('crm-demo on the real runtime', () => {
  it('generates deterministic worlds and boots the default scenario', async () => {
    await expectBootableWorld(definition);
  });

  it('creates, edits and deletes a deal that survives reloads, with an activity trail', async () => {
    fresh();
    let runtime = await boot();
    let crm = createCrmServices(runtime);
    const company = (await runtime.db.companies.toArray())[0];
    if (!company) throw new Error('seed has companies');

    const deal = await crm.deals.create({
      title: 'Atlas expansion',
      companyId: company.id,
      amount: 42_000,
      closeDate: '2026-11-30',
    });
    expect(deal.id).toMatch(/^deal_u/);

    runtime = await reload(runtime);
    crm = createCrmServices(runtime);
    expect((await runtime.db.deals.get(deal.id))?.title).toBe('Atlas expansion');

    await crm.deals.moveStage(deal.id, 'negotiation');
    runtime = await reload(runtime);
    crm = createCrmServices(runtime);
    const moved = await runtime.db.deals.get(deal.id);
    expect(moved?.stage).toBe('negotiation');
    expect(moved?.probability).toBe(75);
    const trail = await runtime.db.activities.where('dealId').equals(deal.id).toArray();
    expect(trail.map((a) => a.type).sort()).toEqual(['created', 'stage-change']);

    await crm.deals.remove(deal.id);
    runtime = await reload(runtime);
    expect(await runtime.db.deals.get(deal.id)).toBeUndefined();
    expect(await runtime.db.activities.where('dealId').equals(deal.id).count()).toBe(0);
  });

  it('switching persona keeps data and changes what is allowed — at the service level', async () => {
    fresh();
    const runtime = await boot();
    const crm = createCrmServices(runtime);
    const before = await runtime.db.deals.count();

    await runtime.session.switchActor('user_0004'); // viewer
    expect(runtime.session.principal()?.role).toBe('viewer');
    expect(await runtime.db.deals.count()).toBe(before);
    const company = (await runtime.db.companies.toArray())[0];
    await expect(
      crm.deals.create({
        title: 'Blocked',
        companyId: company?.id ?? '',
        amount: 1,
        closeDate: '2026-12-01',
      })
    ).rejects.toBeInstanceOf(PermissionDeniedError);

    await runtime.session.switchActor('user_0003'); // rep
    const deals = await runtime.db.deals.toArray();
    const mine = deals.find((d) => d.ownerId === 'user_0003');
    const theirs = deals.find((d) => d.ownerId !== 'user_0003');
    if (mine) await expect(crm.deals.moveStage(mine.id, 'won')).resolves.toBeUndefined();
    if (theirs) {
      await expect(crm.deals.moveStage(theirs.id, 'lost')).rejects.toBeInstanceOf(
        PermissionDeniedError
      );
    }
    await expect(crm.companies.remove(company?.id ?? '')).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
  });

  it('overrides (role, theme, offline) never touch records; offline makes saves fail honestly', async () => {
    fresh();
    const runtime = await boot();
    const crm = createCrmServices(runtime);
    const snapshot = JSON.stringify(await runtime.db.deals.orderBy('id').toArray());

    await runtime.theme.setOverride({ themeId: 'ocean', mode: 'dark' });
    await runtime.overrides.set({ environment: { network: 'offline' } });
    expect(JSON.stringify(await runtime.db.deals.orderBy('id').toArray())).toBe(snapshot);

    const company = (await runtime.db.companies.toArray())[0];
    await expect(
      crm.deals.create({
        title: 'Offline deal',
        companyId: company?.id ?? '',
        amount: 10,
        closeDate: '2026-12-01',
      })
    ).rejects.toMatchObject({ code: 'offline' });
    expect(await runtime.db.deals.filter((d) => d.title === 'Offline deal').count()).toBe(0);
  });

  it('snapshot save → edit → restore returns the exact world', async () => {
    fresh();
    const runtime = await boot();
    const crm = createCrmServices(runtime);
    const before = await runtime.db.deals.orderBy('id').toArray();
    const saved = await runtime.snapshots.save({ name: 'Before demo' });

    const first = before[0];
    if (!first) throw new Error('deals');
    await crm.deals.remove(first.id);
    expect(await runtime.db.deals.count()).toBe(before.length - 1);

    await runtime.snapshots.restore(saved.id);
    expect(await runtime.db.deals.orderBy('id').toArray()).toEqual(before);
  });
});
