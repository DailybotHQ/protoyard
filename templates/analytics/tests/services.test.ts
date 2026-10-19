import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { AnalyticsDatabase } from '../src/database/schema.ts';
import { createServices } from '../src/domain/services.ts';
import { ValidationError } from '../src/domain/validation.ts';
import { definition } from '../src/prototype.ts';
import { DEFAULT_LAYOUT } from '../src/scenarios/seeds.ts';

/**
 * Domain tests on the REAL runtime with an in-memory IndexedDB. `reload()`
 * closes the runtime and opens a new one on the same storage, like a page
 * reload, so these prove persistence, not just in-memory state.
 */

let harness = createHarness<AnalyticsDatabase>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<AnalyticsDatabase>(definition);
});

const paid = {
  combinator: 'and' as const,
  conditions: [{ property: 'properties.plan', operator: 'eq' as const, value: 'pro' }],
};

describe('analytics services on the real runtime', () => {
  it('saves a dashboard layout and a rename that survive reloads, with an audit trail', async () => {
    let runtime = await harness.boot('active');
    let services = createServices(runtime);
    const moved = DEFAULT_LAYOUT.map((w) => (w.id === 'w-mix' ? { ...w, x: 0, y: 8, w: 12 } : w));
    await services.dashboards.saveLayout('dashboard_overview', { layout: moved });
    await services.dashboards.rename('dashboard_overview', { name: 'Growth review' });

    runtime = await harness.reload(runtime);
    services = createServices(runtime);
    const saved = await runtime.db.dashboards.get('dashboard_overview');
    expect(saved?.name).toBe('Growth review');
    expect(saved?.layout.find((w) => w.id === 'w-mix')).toMatchObject({ x: 0, y: 8, w: 12 });
    const trail = await runtime.db.activity.toArray();
    expect(trail.map((a) => a.type).sort()).toEqual([
      'dashboard.layout_saved',
      'dashboard.renamed',
    ]);
    expect(trail.every((a) => a.actorId === 'user_0001')).toBe(true);
  });

  it('creates, renames and deletes a segment across reloads', async () => {
    let runtime = await harness.boot('active');
    let services = createServices(runtime);
    const segment = await services.segments.create({ name: '  Pro users ', filter: paid });
    expect(segment).toMatchObject({ name: 'Pro users', ownerId: 'user_0001' });

    runtime = await harness.reload(runtime);
    services = createServices(runtime);
    expect((await runtime.db.segments.get(segment.id))?.filter).toEqual(paid);
    await services.segments.rename(segment.id, { name: 'Pro plan' });
    await services.segments.remove(segment.id);

    runtime = await harness.reload(runtime);
    expect(await runtime.db.segments.get(segment.id)).toBeUndefined();
    expect((await runtime.db.activity.toArray()).map((a) => a.type)).toEqual(
      expect.arrayContaining(['segment.created', 'segment.renamed', 'segment.deleted'])
    );
  });

  it('rejects invalid layouts, unknown filter properties and short names with field errors', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const overflow = [{ id: 'x', widget: 'trend', x: 10, y: 0, w: 4, h: 2 }];
    await expect(
      services.dashboards.saveLayout('dashboard_overview', { layout: overflow })
    ).rejects.toBeInstanceOf(ValidationError);
    const error = await services.segments
      .create({
        name: 'A',
        filter: {
          combinator: 'and',
          conditions: [{ property: 'properties.secret', operator: 'eq', value: 'x' }],
        },
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(Object.keys((error as ValidationError).issues)).toEqual(
      expect.arrayContaining(['name', 'filter.conditions.0.property'])
    );
  });

  it('enforces roles and segment ownership at service level', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);

    await runtime.session.switchActor('user_0003'); // member: own segments only
    const own = await services.segments.create({ name: 'Mine', filter: paid });
    await services.segments.rename(own.id, { name: 'Still mine' });
    await expect(services.segments.remove('segment_paid')).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await services.dashboards.saveLayout('dashboard_overview', { layout: DEFAULT_LAYOUT });

    await runtime.session.switchActor('user_0004'); // viewer: read-only
    await expect(
      services.dashboards.saveLayout('dashboard_overview', { layout: DEFAULT_LAYOUT })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(
      services.dashboards.rename('dashboard_overview', { name: 'Nope' })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(services.segments.create({ name: 'Nope', filter: paid })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await expect(services.segments.remove(own.id)).rejects.toBeInstanceOf(PermissionDeniedError);

    await runtime.session.switchActor('user_0002'); // admin: every segment
    await services.segments.remove('segment_mobile');
    expect(await runtime.db.segments.get('segment_mobile')).toBeUndefined();
    expect(await runtime.db.segments.get('segment_paid')).toBeDefined();
  });

  it('writes nothing while offline', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const before = await runtime.db.dashboards.get('dashboard_overview');
    const segments = await runtime.db.segments.count();
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(
      services.dashboards.rename('dashboard_overview', { name: 'Offline name' })
    ).rejects.toBeInstanceOf(SimulatedServiceError);
    await expect(
      services.segments.create({ name: 'Offline', filter: paid })
    ).rejects.toBeInstanceOf(SimulatedServiceError);
    await expect(services.segments.remove('segment_paid')).rejects.toBeInstanceOf(
      SimulatedServiceError
    );
    expect(await runtime.db.dashboards.get('dashboard_overview')).toEqual(before);
    expect(await runtime.db.segments.count()).toBe(segments);
    expect(await runtime.db.activity.count()).toBe(0);
  });

  it('loads every scenario with its dashboard', async () => {
    for (const id of definition.manifest.scenarios) {
      const runtime = await harness.boot(id);
      expect(await runtime.db.dashboards.count(), id).toBe(1);
      harness.closeAll();
      harness = createHarness<AnalyticsDatabase>(definition);
    }
    // The massive world writes ~16k events into the in-memory IndexedDB.
  }, 60_000);

  it('starts the viewer scenario as a read-only persona on the same data', async () => {
    const viewer = await harness.boot('viewer');
    expect(viewer.session.principal()?.persona.id).toBe('user_0004');
    expect(viewer.session.can('dashboards:edit')).toBe(false);
    expect(await viewer.db.events.count()).toBeGreaterThan(1000);
  });

  it('moves the live counter when simulated time advances', async () => {
    const runtime = await harness.boot('active');
    const before = (await runtime.db.counters.get('active_users'))?.value ?? 0;
    await runtime.scenarios.advance({ days: 1 });
    expect((await runtime.db.counters.get('active_users'))?.value ?? 0).toBeGreaterThan(before);
  });
});
