import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { AnalyticsDatabase } from '../src/database/schema.ts';
import { createServices } from '../src/domain/services.ts';
import { type ReportInput, ValidationError } from '../src/domain/validation.ts';
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
const OWNER = 'user_0001';
const ANALYST = 'user_0002';
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

  it('lets the analyst save, rename and delete their own report across reloads', async () => {
    let runtime = await harness.boot('healthy-growth');
    await runtime.session.switchActor(ANALYST);
    let services = createServices(runtime);
    const report = await services.reports.save({
      projectId: WEB,
      name: 'Pro signups by country',
      config,
    });
    expect(report).toMatchObject({ ownerId: ANALYST, projectId: WEB, config });

    runtime = await harness.reload(runtime);
    await runtime.session.switchActor(ANALYST);
    services = createServices(runtime);
    expect((await runtime.db.reports.get(report.id))?.config).toEqual(config);
    await services.reports.rename(report.id, { name: 'Pro signups' });
    expect((await runtime.db.reports.get(report.id))?.name).toBe('Pro signups');
    // Someone else's report: denied for the analyst, allowed for the owner.
    await expect(services.reports.remove(`report_signups_${WEB}`)).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await services.reports.remove(report.id);
    await runtime.session.switchActor(OWNER);
    await createServices(runtime).reports.remove(`report_exports_${WEB}`);

    runtime = await harness.reload(runtime);
    expect(await runtime.db.reports.get(report.id)).toBeUndefined();
    expect(await runtime.db.reports.get(`report_exports_${WEB}`)).toBeUndefined();
    expect(await runtime.db.reports.get(`report_signups_${WEB}`)).toBeDefined();
  });

  it('rejects invalid reports, alerts and annotations with field errors', async () => {
    const runtime = await harness.boot('healthy-growth');
    const services = createServices(runtime);
    const report = await services.reports
      .save({
        projectId: WEB,
        name: 'X',
        config: { ...config, eventType: 'drop_table' } as unknown as ReportInput['config'],
      })
      .catch((e: unknown) => e);
    expect(report).toBeInstanceOf(ValidationError);
    expect(Object.keys((report as ValidationError).issues)).toEqual(
      expect.arrayContaining(['name', 'config.eventType'])
    );
    const alert = await services.alerts
      .create({
        projectId: WEB,
        name: 'Bad',
        eventType: 'signup',
        operator: 'below',
        threshold: '-3',
      })
      .catch((e: unknown) => e);
    expect((alert as ValidationError).issues).toHaveProperty('threshold');
    await expect(
      services.annotations.create({
        projectId: WEB,
        title: 'From the future',
        kind: 'release',
        day: '2027-01-01',
      })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      services.segments.create({ projectId: 'proj_missing', name: 'Ghost', filter })
    ).rejects.toBeInstanceOf(ValidationError);
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

  it('writes nothing while offline', async () => {
    const runtime = await harness.boot('healthy-growth');
    const services = createServices(runtime);
    const counts = async () =>
      Promise.all([
        runtime.db.reports.count(),
        runtime.db.alerts.count(),
        runtime.db.annotations.count(),
        runtime.db.segments.count(),
        runtime.db.activity.count(),
      ]);
    const before = await counts();
    await runtime.overrides.set({ environment: { network: 'offline' } });
    for (const attempt of [
      services.reports.save({ projectId: WEB, name: 'Offline report', config }),
      services.alerts.create({
        projectId: WEB,
        name: 'Offline alert',
        eventType: 'signup',
        operator: 'below',
        threshold: 1,
      }),
      services.alerts.setMuted(`alert_pageviews_${WEB}`, true),
      services.annotations.create({
        projectId: WEB,
        title: 'Offline note',
        kind: 'release',
        day: '2026-10-10',
      }),
      services.segments.create({ projectId: WEB, name: 'Offline segment', filter }),
    ]) {
      await expect(attempt).rejects.toBeInstanceOf(SimulatedServiceError);
    }
    expect(await counts()).toEqual(before);
    expect((await runtime.db.alerts.get(`alert_pageviews_${WEB}`))?.muted).toBe(false);
  });

  it('creates an alert with a baseline from the data; advancing time checks it daily', async () => {
    const runtime = await harness.boot('healthy-growth');
    const services = createServices(runtime);
    const alert = await services.alerts.create({
      projectId: WEB,
      name: 'Any page views',
      eventType: 'page_view',
      operator: 'above',
      threshold: 0,
    });
    expect(alert.baseline).toBeGreaterThan(0);
    await services.alerts.setMuted(`alert_exports_${WEB}`, true);
    await runtime.scenarios.advance({ days: 3 });

    const checks = await runtime.db.alertChecks.where('alertId').equals(alert.id).toArray();
    expect(checks).toHaveLength(3);
    // Above 0 always fires; the stored alert follows its latest check.
    expect(checks.every((c) => c.fired)).toBe(true);
    expect(await runtime.db.alerts.get(alert.id)).toMatchObject({
      status: 'firing',
      lastValue: checks.at(-1)?.value,
    });
    // A muted alert is still checked but never fires.
    const muted = await runtime.db.alertChecks
      .where('alertId')
      .equals(`alert_exports_${WEB}`)
      .toArray();
    expect(muted.filter((c) => c.at > '2026-10-16T09:00:00.000Z').every((c) => !c.fired)).toBe(
      true
    );
  });

  it('adds and removes annotations with ownership', async () => {
    const runtime = await harness.boot('healthy-growth');
    await runtime.session.switchActor(ANALYST);
    const services = createServices(runtime);
    const note = await services.annotations.create({
      projectId: WEB,
      title: 'Pricing page test',
      kind: 'campaign',
      day: '2026-10-12',
    });
    expect(note).toMatchObject({ at: '2026-10-12T12:00:00.000Z', authorId: ANALYST });
    const release = (await runtime.db.annotations.where('projectId').equals(WEB).toArray()).find(
      (a) => a.kind === 'release'
    );
    await expect(services.annotations.remove(release?.id as string)).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await services.annotations.remove(note.id);
    expect(await runtime.db.annotations.get(note.id)).toBeUndefined();
  });

  it('loads every scenario with both projects and their dashboards', async () => {
    for (const id of definition.manifest.scenarios) {
      const runtime = await harness.boot(id);
      expect(await runtime.db.projects.count(), id).toBe(2);
      expect(await runtime.db.dashboards.count(), id).toBe(2);
      harness.closeAll();
      harness = createHarness<AnalyticsDatabase>(definition);
    }
  }, 60_000);
});
