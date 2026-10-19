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
 * Relationships: project 1─* user, event, rollup, dashboard, report, segment,
 * alert, annotation; user 1─* event; alert 1─* alert check. `ownerId`,
 * `authorId` and `actorId` reference personas in `py_personas`; activity is
 * the audit trail of edits.
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

/** A tracked product (web app, mobile app). `sampleRate` < 1: events are a raw sample and `rollups` hold the full daily counts. */
export type Project = {
  id: string;
  name: string;
  platform: string;
  createdAt: string;
  sampleRate: number;
};

/** Exact daily event counts per type for sampled projects (the full stream, pre-aggregated). */
export type DailyRollup = {
  id: string;
  projectId: string;
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  type: string;
  count: number;
};

/** A tracked end user of the simulated product (not a persona of this app). */
export type TrackedUser = {
  id: string;
  projectId: string;
  /** ISO instant of the first event. */
  createdAt: string;
  properties: Record<string, EventPropertyValue>;
  /**
   * Library avatar id (`av-NNN`) from the generator; resolve it with
   * `avatarImage`. Users without one (older worlds) show initials.
   */
  avatar?: string;
};

/** One tracked product event (`@protoyard/analytics` shape) in a project. */
export type TrackedEvent = AnalyticsEvent & { projectId: string };

export type SavedDashboard = {
  id: string;
  projectId: string;
  name: string;
  /** Widget placements on the 12-column grid. */
  layout: DashboardLayout;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedSegment = {
  id: string;
  projectId: string;
  name: string;
  filter: FilterGroup;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export const REPORT_MEASURES = ['events', 'users'] as const;

/** A saved Trends query: what Trends shows when the report is opened. */
export type ReportConfig = {
  /** An event type, or `all`. */
  eventType: string;
  measure: (typeof REPORT_MEASURES)[number];
  breakdown: string | null;
  filter: FilterGroup;
};

export type SavedReport = {
  id: string;
  projectId: string;
  name: string;
  config: ReportConfig;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export const ALERT_OPERATORS = ['above', 'below'] as const;
export type AlertOperator = (typeof ALERT_OPERATORS)[number];

/** A threshold on a daily event count, checked once a day as simulated time advances. */
export type MetricAlert = {
  id: string;
  projectId: string;
  name: string;
  eventType: string;
  operator: AlertOperator;
  /** Daily count that triggers the alert. */
  threshold: number;
  /** Typical daily count, the centre of the simulated daily checks. */
  baseline: number;
  muted: boolean;
  status: 'ok' | 'firing';
  lastValue: number | null;
  lastCheckedAt: string | null;
  lastFiredAt: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

/** One daily check of an alert (written by the timeline). */
export type AlertCheck = {
  id: string;
  alertId: string;
  projectId: string;
  at: string;
  value: number;
  fired: boolean;
};

export const ANNOTATION_KINDS = ['release', 'incident', 'campaign'] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

/** A note on the timeline (release, incident, campaign) shown with the trend charts. */
export type Annotation = {
  id: string;
  projectId: string;
  at: string;
  title: string;
  kind: AnnotationKind;
  authorId: string;
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
  | 'segment.deleted'
  | 'report.saved'
  | 'report.renamed'
  | 'report.deleted'
  | 'alert.created'
  | 'alert.muted'
  | 'alert.unmuted'
  | 'alert.deleted'
  | 'annotation.created'
  | 'annotation.deleted';

/** Append-only audit trail written in the same transaction as the change it describes. */
export type Activity = {
  id: string;
  type: ActivityType;
  message: string;
  actorId: string;
  at: string;
};

export type AnalyticsDatabase = Dexie & {
  projects: EntityTable<Project, 'id'>;
  rollups: EntityTable<DailyRollup, 'id'>;
  users: EntityTable<TrackedUser, 'id'>;
  events: EntityTable<TrackedEvent, 'id'>;
  dashboards: EntityTable<SavedDashboard, 'id'>;
  segments: EntityTable<SavedSegment, 'id'>;
  reports: EntityTable<SavedReport, 'id'>;
  alerts: EntityTable<MetricAlert, 'id'>;
  alertChecks: EntityTable<AlertCheck, 'id'>;
  annotations: EntityTable<Annotation, 'id'>;
  counters: EntityTable<LiveCounterRow, 'id'>;
  activity: EntityTable<Activity, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        projects: 'id',
        rollups: 'id, [projectId+day]',
        users: 'id, projectId, createdAt',
        // [type+at] serves "events of a type in a range"; at serves range scans of every type.
        events: 'id, [type+at], userId, projectId, at',
        dashboards: 'id, projectId, ownerId, updatedAt',
        segments: 'id, projectId, ownerId, name',
        reports: 'id, projectId, ownerId, updatedAt',
        alerts: 'id, projectId, ownerId',
        alertChecks: 'id, alertId, at',
        annotations: 'id, projectId, at',
        counters: 'id',
        activity: 'id, actorId, at',
      },
    },
  ],
};
