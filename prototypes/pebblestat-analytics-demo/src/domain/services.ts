import { createRuntimeId, PermissionDeniedError, type PrototypeRuntime } from '@protoyard/core';
import type {
  Activity,
  ActivityType,
  AnalyticsDatabase,
  Annotation,
  MetricAlert,
  SavedDashboard,
  SavedReport,
  SavedSegment,
} from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';
import {
  type AlertInput,
  AlertInputSchema,
  type AnnotationInput,
  AnnotationInputSchema,
  type LayoutInput,
  LayoutInputSchema,
  parse,
  type RenameInput,
  RenameInputSchema,
  type ReportInput,
  ReportInputSchema,
  type SegmentInput,
  SegmentInputSchema,
  ValidationError,
} from './validation.ts';

/**
 * Domain services: the ONLY way screens change data. Each mutation
 *   1. checks the simulated policy (`session.assert`) — enforced even if the UI is bypassed,
 *   2. validates input with zod (field errors come back as `ValidationError.issues`),
 *   3. runs through the simulated environment (latency / offline / failures),
 *   4. writes every related row in ONE Dexie transaction (change + audit row).
 * Tracked events, rollups and alert checks are read-only here: they come from
 * scenarios and the timeline.
 */

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`This ${what} no longer exists. It may have been deleted in another tab.`);
    this.name = 'NotFoundError';
  }
}

export function createServices(runtime: PrototypeRuntime<AnalyticsDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  const actorId = () => {
    const principal = session.principal();
    if (!principal) throw new Error('No active persona. Load a scenario first.');
    return principal.persona.id;
  };
  const activity = (type: ActivityType, message: string): Activity => ({
    id: createRuntimeId('activity'),
    type,
    message,
    actorId: actorId(),
    at: now(),
  });
  /** Owners (the `…:manage-all` capability) act on anything; others only on rows they own. */
  const assertOwner = (row: { ownerId: string }, manageAll: string) => {
    if (session.can(manageAll)) return;
    if (row.ownerId !== actorId()) {
      throw new PermissionDeniedError(manageAll, session.principal()?.role ?? null);
    }
  };
  const assertProject = async (projectId: string) => {
    if (!(await db.projects.get(projectId))) {
      throw new ValidationError({ projectId: 'That project no longer exists' });
    }
  };

  return {
    dashboards: {
      /** Saves widget positions and sizes (the grid calls this after every move or resize). */
      async saveLayout(id: string, input: LayoutInput): Promise<SavedDashboard> {
        session.assert(CAPABILITIES.dashboardsEdit);
        const { layout } = parse(LayoutInputSchema, input);
        return environment.run('dashboards.layout', () =>
          db.transaction('rw', db.dashboards, db.activity, async () => {
            const dashboard = await db.dashboards.get(id);
            if (!dashboard) throw new NotFoundError('dashboard');
            const next = { ...dashboard, layout, updatedAt: now() };
            await db.dashboards.put(next);
            await db.activity.add(
              activity('dashboard.layout_saved', `Rearranged ${dashboard.name}`)
            );
            return next;
          })
        );
      },

      async rename(id: string, input: RenameInput): Promise<void> {
        session.assert(CAPABILITIES.dashboardsEdit);
        const { name } = parse(RenameInputSchema, input);
        await environment.run('dashboards.rename', () =>
          db.transaction('rw', db.dashboards, db.activity, async () => {
            const dashboard = await db.dashboards.get(id);
            if (!dashboard) throw new NotFoundError('dashboard');
            await db.dashboards.put({ ...dashboard, name, updatedAt: now() });
            await db.activity.add(
              activity('dashboard.renamed', `Renamed ${dashboard.name} to ${name}`)
            );
          })
        );
      },
    },

    segments: {
      async create(input: SegmentInput): Promise<SavedSegment> {
        session.assert(CAPABILITIES.segmentsCreate);
        const data = parse(SegmentInputSchema, input);
        return environment.run('segments.create', () =>
          db.transaction('rw', db.projects, db.segments, db.activity, async () => {
            await assertProject(data.projectId);
            const at = now();
            const segment: SavedSegment = {
              id: createRuntimeId('segment'),
              projectId: data.projectId,
              name: data.name,
              filter: data.filter,
              ownerId: actorId(),
              createdAt: at,
              updatedAt: at,
            };
            await db.segments.add(segment);
            await db.activity.add(activity('segment.created', `Saved segment ${segment.name}`));
            return segment;
          })
        );
      },

      async rename(id: string, input: RenameInput): Promise<void> {
        // Ownership is checked inside the transaction, against the stored row.
        session.assert(CAPABILITIES.segmentsManageOwn);
        const { name } = parse(RenameInputSchema, input);
        await environment.run('segments.rename', () =>
          db.transaction('rw', db.segments, db.activity, async () => {
            const segment = await db.segments.get(id);
            if (!segment) throw new NotFoundError('segment');
            assertOwner(segment, CAPABILITIES.segmentsManageAll);
            // put, not update: Dexie's typed update paths recurse on the nested filter type.
            await db.segments.put({ ...segment, name, updatedAt: now() });
            await db.activity.add(
              activity('segment.renamed', `Renamed segment ${segment.name} to ${name}`)
            );
          })
        );
      },

      async remove(id: string): Promise<void> {
        session.assert(CAPABILITIES.segmentsManageOwn);
        await environment.run('segments.delete', () =>
          db.transaction('rw', db.segments, db.activity, async () => {
            const segment = await db.segments.get(id);
            if (!segment) return;
            assertOwner(segment, CAPABILITIES.segmentsManageAll);
            await db.segments.delete(id);
            await db.activity.add(activity('segment.deleted', `Deleted segment ${segment.name}`));
          })
        );
      },
    },

    reports: {
      /** Saves the current Trends query as a named report. */
      async save(input: ReportInput): Promise<SavedReport> {
        session.assert(CAPABILITIES.reportsSave);
        const data = parse(ReportInputSchema, input);
        return environment.run('reports.save', () =>
          db.transaction('rw', db.projects, db.reports, db.activity, async () => {
            await assertProject(data.projectId);
            const at = now();
            const report: SavedReport = {
              id: createRuntimeId('report'),
              projectId: data.projectId,
              name: data.name,
              config: data.config,
              ownerId: actorId(),
              createdAt: at,
              updatedAt: at,
            };
            await db.reports.add(report);
            await db.activity.add(activity('report.saved', `Saved report ${report.name}`));
            return report;
          })
        );
      },

      async rename(id: string, input: RenameInput): Promise<void> {
        session.assert(CAPABILITIES.reportsSave);
        const { name } = parse(RenameInputSchema, input);
        await environment.run('reports.rename', () =>
          db.transaction('rw', db.reports, db.activity, async () => {
            const report = await db.reports.get(id);
            if (!report) throw new NotFoundError('report');
            assertOwner(report, CAPABILITIES.reportsManageAll);
            await db.reports.put({ ...report, name, updatedAt: now() });
            await db.activity.add(
              activity('report.renamed', `Renamed report ${report.name} to ${name}`)
            );
          })
        );
      },

      async remove(id: string): Promise<void> {
        session.assert(CAPABILITIES.reportsSave);
        await environment.run('reports.delete', () =>
          db.transaction('rw', db.reports, db.activity, async () => {
            const report = await db.reports.get(id);
            if (!report) return;
            assertOwner(report, CAPABILITIES.reportsManageAll);
            await db.reports.delete(id);
            await db.activity.add(activity('report.deleted', `Deleted report ${report.name}`));
          })
        );
      },
    },

    alerts: {
      /** A daily threshold; the baseline (typical daily count) comes from the project's last 14 days. */
      async create(input: AlertInput): Promise<MetricAlert> {
        session.assert(CAPABILITIES.alertsManage);
        const data = parse(AlertInputSchema, input);
        return environment.run('alerts.create', () =>
          db.transaction(
            'rw',
            [db.projects, db.events, db.rollups, db.alerts, db.activity],
            async () => {
              await assertProject(data.projectId);
              const at = now();
              const alert: MetricAlert = {
                id: createRuntimeId('alert'),
                ...data,
                baseline: await typicalDailyCount(db, data.projectId, data.eventType, clock.now()),
                muted: false,
                status: 'ok',
                lastValue: null,
                lastCheckedAt: null,
                lastFiredAt: null,
                ownerId: actorId(),
                createdAt: at,
                updatedAt: at,
              };
              await db.alerts.add(alert);
              await db.activity.add(activity('alert.created', `Created alert ${alert.name}`));
              return alert;
            }
          )
        );
      },

      /** Muted alerts are still checked but never fire. */
      async setMuted(id: string, muted: boolean): Promise<void> {
        session.assert(CAPABILITIES.alertsManage);
        await environment.run('alerts.mute', () =>
          db.transaction('rw', db.alerts, db.activity, async () => {
            const alert = await db.alerts.get(id);
            if (!alert) throw new NotFoundError('alert');
            assertOwner(alert, CAPABILITIES.alertsManageAll);
            if (alert.muted === muted) return;
            await db.alerts.put({
              ...alert,
              muted,
              status: muted ? 'ok' : alert.status,
              updatedAt: now(),
            });
            await db.activity.add(
              activity(
                muted ? 'alert.muted' : 'alert.unmuted',
                `${muted ? 'Muted' : 'Unmuted'} alert ${alert.name}`
              )
            );
          })
        );
      },

      /** Deletes the alert and its check history. */
      async remove(id: string): Promise<void> {
        session.assert(CAPABILITIES.alertsManage);
        await environment.run('alerts.delete', () =>
          db.transaction('rw', db.alerts, db.alertChecks, db.activity, async () => {
            const alert = await db.alerts.get(id);
            if (!alert) return;
            assertOwner(alert, CAPABILITIES.alertsManageAll);
            await db.alertChecks.where('alertId').equals(id).delete();
            await db.alerts.delete(id);
            await db.activity.add(activity('alert.deleted', `Deleted alert ${alert.name}`));
          })
        );
      },
    },

    annotations: {
      async create(input: AnnotationInput): Promise<Annotation> {
        session.assert(CAPABILITIES.annotationsCreate);
        const data = parse(AnnotationInputSchema, input);
        if (Date.parse(`${data.day}T12:00:00.000Z`) > clock.now().getTime()) {
          throw new ValidationError({ day: 'Annotations mark something that already happened' });
        }
        return environment.run('annotations.create', () =>
          db.transaction('rw', db.projects, db.annotations, db.activity, async () => {
            await assertProject(data.projectId);
            const annotation: Annotation = {
              id: createRuntimeId('annotation'),
              projectId: data.projectId,
              at: `${data.day}T12:00:00.000Z`,
              title: data.title,
              kind: data.kind,
              authorId: actorId(),
            };
            await db.annotations.add(annotation);
            await db.activity.add(
              activity('annotation.created', `Annotated ${data.day}: ${data.title}`)
            );
            return annotation;
          })
        );
      },

      async remove(id: string): Promise<void> {
        session.assert(CAPABILITIES.annotationsCreate);
        await environment.run('annotations.delete', () =>
          db.transaction('rw', db.annotations, db.activity, async () => {
            const annotation = await db.annotations.get(id);
            if (!annotation) return;
            assertOwner({ ownerId: annotation.authorId }, CAPABILITIES.annotationsManageAll);
            await db.annotations.delete(id);
            await db.activity.add(
              activity('annotation.deleted', `Removed annotation ${annotation.title}`)
            );
          })
        );
      },
    },
  };
}

/** Median daily count of `type` over the 14 days before `now` (rollups for sampled projects). */
export async function typicalDailyCount(
  db: AnalyticsDatabase,
  projectId: string,
  type: string,
  now: Date
): Promise<number> {
  const DAY = 86_400_000;
  const end = Math.floor(now.getTime() / DAY) * DAY;
  const days = Array.from({ length: 14 }, (_, i) =>
    new Date(end - (14 - i) * DAY).toISOString().slice(0, 10)
  );
  const project = await db.projects.get(projectId);
  const counts = new Map(days.map((d) => [d, 0]));
  if (project && project.sampleRate < 1) {
    const rows = await db.rollups
      .where('[projectId+day]')
      .between([projectId, days[0] as string], [projectId, days.at(-1) as string], true, true)
      .toArray();
    for (const r of rows)
      if (r.type === type) counts.set(r.day, (counts.get(r.day) ?? 0) + r.count);
  } else {
    const events = await db.events
      .where('[type+at]')
      .between([type, `${days[0]}T00:00:00.000Z`], [type, new Date(end).toISOString()], true, false)
      .toArray();
    for (const e of events) {
      if (e.projectId !== projectId) continue;
      const day = e.at.slice(0, 10);
      if (counts.has(day)) counts.set(day, (counts.get(day) ?? 0) + 1);
    }
  }
  const sorted = [...counts.values()].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export type AnalyticsServices = ReturnType<typeof createServices>;
