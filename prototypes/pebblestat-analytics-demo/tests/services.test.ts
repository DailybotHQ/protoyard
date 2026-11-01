import { PermissionDeniedError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { expectBootableWorld } from '../../../tests/support/smoke.ts';
import type { AnalyticsDatabase } from '../src/database/schema.ts';
import { createServices } from '../src/domain/services.ts';
import type { ReportInput } from '../src/domain/validation.ts';
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

const WEB = 'proj_web';
const VIEWER = 'user_0003';
const config: ReportInput['config'] = {
  eventType: 'signup',
  measure: 'users',
  breakdown: 'properties.country',
  filter: {
    combinator: 'and',
    conditions: [{ property: 'properties.plan', operator: 'eq', value: 'pro' }],
  },
};
const filter = config.filter;

describe('Pebblestat services on the real runtime', () => {
  it('generates deterministic worlds and boots the default scenario', async () => {
    await expectBootableWorld(definition, harness);
  });

  it('saves a dashboard layout and name that survive reloads, with an audit trail', async () => {
    let runtime = await harness.boot('healthy-growth');
    let services = createServices(runtime);
    const moved = DEFAULT_LAYOUT.map((w) => (w.id === 'w-mix' ? { ...w, x: 0, y: 8, w: 12 } : w));
    await services.dashboards.saveLayout(`dashboard_${WEB}`, { layout: moved });
    await services.dashboards.rename(`dashboard_${WEB}`, { name: 'Growth review' });
    runtime = await harness.reload(runtime);
    services = createServices(runtime);
    const saved = await runtime.db.dashboards.get(`dashboard_${WEB}`);
    expect(saved).toMatchObject({ name: 'Growth review', projectId: WEB });
    expect(saved?.layout.find((w) => w.id === 'w-mix')).toMatchObject({ x: 0, y: 8, w: 12 });
    expect((await runtime.db.activity.toArray()).map((a) => a.type).sort()).toEqual([
      'dashboard.layout_saved',
      'dashboard.renamed',
    ]);
  });

  it('keeps the viewer read-only at service level', async () => {
    const runtime = await harness.boot('healthy-growth');
    await runtime.session.switchActor(VIEWER);
    const services = createServices(runtime);
    const denied = [
      services.dashboards.saveLayout(`dashboard_${WEB}`, { layout: DEFAULT_LAYOUT }),
      services.dashboards.rename(`dashboard_${WEB}`, { name: 'Nope' }),
      services.reports.save({ projectId: WEB, name: 'Nope', config }),
      services.reports.remove(`report_signups_${WEB}`),
      services.segments.create({ projectId: WEB, name: 'Nope', filter }),
      services.alerts.create({
        projectId: WEB,
        name: 'Nope',
        eventType: 'signup',
        operator: 'below',
        threshold: 1,
      }),
      services.alerts.setMuted(`alert_pageviews_${WEB}`, true),
      services.annotations.create({
        projectId: WEB,
        title: 'Nope',
        kind: 'release',
        day: '2026-10-10',
      }),
    ];
    for (const attempt of denied)
      await expect(attempt).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(await runtime.db.activity.count()).toBe(0);
  });
});
