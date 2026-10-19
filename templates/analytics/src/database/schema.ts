import type {
  AnalyticsEvent,
  DashboardLayout,
  EventPropertyValue,
  FilterGroup,
} from '@protoyard/analytics';
import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/**
 * Domain tables in Dexie store syntax: the first key is the primary key, the
 * rest are indexes. To add a table, add a NEW version (never edit an old
 * one), bump `storage.schemaVersion` in protoyard.json, and add the typed
 * table to `AnalyticsDatabase` below.
 *
 * Relationships: user 1─* event; dashboards and segments belong to a persona
 * (`ownerId` → `py_personas`); activity is the audit trail of edits.
 *
 * Rows are type aliases (not interfaces) so they stay assignable to the
 * generic `Row` the generator returns.
 */

export const PLANS = ['free', 'pro', 'team'] as const;
export type Plan = (typeof PLANS)[number];

export const COUNTRIES = ['NZ', 'CA', 'DE', 'BR', 'JP', 'KE'] as const;

export const PLATFORMS = ['web', 'ios', 'android'] as const;

/** Tracked product event types, in funnel order first. */
export const EVENT_TYPES = [
  'signup',
  'project_created',
  'invite_sent',
  'upgraded',
  'page_view',
  'feature_used',
  'report_exported',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** A tracked end user of the simulated product (not a persona of this app). */
export type TrackedUser = {
  id: string;
  /** ISO instant of the first event. */
  createdAt: string;
  properties: Record<string, EventPropertyValue>;
};

/** One tracked product event (`@protoyard/analytics` shape). */
export type TrackedEvent = AnalyticsEvent;

export type SavedDashboard = {
  id: string;
  name: string;
  /** Widget placements on the 12-column grid. */
  layout: DashboardLayout;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedSegment = {
  id: string;
  name: string;
  filter: FilterGroup;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

/** Running counters moved by timeline events (the Live screen). */
export type LiveCounterRow = {
  id: string;
  value: number;
  updatedAt: string;
};

export type ActivityType =
  | 'dashboard.layout_saved'
  | 'dashboard.renamed'
  | 'segment.created'
  | 'segment.renamed'
  | 'segment.deleted';

/** Append-only audit trail written in the same transaction as the change it describes. */
export type Activity = {
  id: string;
  type: ActivityType;
  message: string;
  actorId: string;
  at: string;
};

export type AnalyticsDatabase = Dexie & {
  users: EntityTable<TrackedUser, 'id'>;
  events: EntityTable<TrackedEvent, 'id'>;
  dashboards: EntityTable<SavedDashboard, 'id'>;
  segments: EntityTable<SavedSegment, 'id'>;
  counters: EntityTable<LiveCounterRow, 'id'>;
  activity: EntityTable<Activity, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        users: 'id, createdAt',
        // [type+at] serves "events of a type in a range"; at serves range scans of every type.
        events: 'id, [type+at], userId, at',
        dashboards: 'id, ownerId, updatedAt',
        segments: 'id, ownerId, name',
        counters: 'id',
        activity: 'id, actorId, at',
      },
    },
  ],
};
