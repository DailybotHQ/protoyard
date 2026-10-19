import { createRuntimeId, PermissionDeniedError, type PrototypeRuntime } from '@protoyard/core';
import type {
  Activity,
  ActivityType,
  AnalyticsDatabase,
  SavedDashboard,
  SavedSegment,
} from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';
import {
  type LayoutInput,
  LayoutInputSchema,
  parse,
  type RenameInput,
  RenameInputSchema,
  type SegmentInput,
  SegmentInputSchema,
} from './validation.ts';

/**
 * Domain services: the ONLY way screens change data. Each mutation
 *   1. checks the simulated policy (`session.assert`) — enforced even if the UI is bypassed,
 *   2. validates input with zod (field errors come back as `ValidationError.issues`),
 *   3. runs through the simulated environment (latency / offline / failures),
 *   4. writes every related row in ONE Dexie transaction (change + audit row).
 * Tracked events are read-only here: they come from scenarios and the timeline.
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
  /** Members manage their own segments; owners and admins manage every segment. */
  const assertSegmentAccess = (segment: SavedSegment) => {
    if (session.can(CAPABILITIES.segmentsManageAll)) return;
    if (segment.ownerId !== actorId()) {
      throw new PermissionDeniedError(
        CAPABILITIES.segmentsManageAll,
        session.principal()?.role ?? null
      );
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
            await db.dashboards.update(id, { name, updatedAt: now() });
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
          db.transaction('rw', db.segments, db.activity, async () => {
            const at = now();
            const segment: SavedSegment = {
              id: createRuntimeId('segment'),
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
            assertSegmentAccess(segment);
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
            assertSegmentAccess(segment);
            await db.segments.delete(id);
            await db.activity.add(activity('segment.deleted', `Deleted segment ${segment.name}`));
          })
        );
      },
    },
  };
}

export type AnalyticsServices = ReturnType<typeof createServices>;
