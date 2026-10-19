import type { DashboardLayout } from '@protoyard/analytics';
import type { Annotation, SavedReport, SavedSegment } from '../database/schema.ts';

/** Widget keys the Overview knows how to render (see `src/widgets/types.ts`). */
export const WIDGETS = ['trend', 'mix', 'plans', 'funnel', 'platforms'] as const;
export type WidgetKey = (typeof WIDGETS)[number];

/** The seeded "Product overview" grid (12 columns). */
export const DEFAULT_LAYOUT: DashboardLayout = [
  { id: 'w-trend', widget: 'trend', title: 'Events over time', x: 0, y: 0, w: 8, h: 4 },
  { id: 'w-mix', widget: 'mix', title: 'Events by type', x: 8, y: 0, w: 4, h: 4 },
  { id: 'w-funnel', widget: 'funnel', title: 'Activation funnel', x: 0, y: 4, w: 6, h: 4 },
  { id: 'w-plans', widget: 'plans', title: 'New users by plan', x: 6, y: 4, w: 3, h: 4 },
  { id: 'w-platforms', widget: 'platforms', title: 'Events by platform', x: 9, y: 4, w: 3, h: 4 },
];

/** Two saved segments on the Web project: one by the owner, one by the analyst. */
export function defaultSegments(projectId: string, at: string): SavedSegment[] {
  return [
    {
      id: `segment_paid_${projectId}`,
      projectId,
      name: 'Paying plans',
      filter: {
        combinator: 'or',
        conditions: [
          { property: 'properties.plan', operator: 'eq', value: 'pro' },
          { property: 'properties.plan', operator: 'eq', value: 'team' },
        ],
      },
      ownerId: 'user_0001',
      createdAt: at,
      updatedAt: at,
    },
    {
      id: `segment_europe_${projectId}`,
      projectId,
      name: 'Europe',
      filter: {
        combinator: 'and',
        conditions: [{ property: 'properties.country', operator: 'eq', value: 'DE' }],
      },
      ownerId: 'user_0002',
      createdAt: at,
      updatedAt: at,
    },
  ];
}

/** Saved Trends reports: the owner's weekly signups and the analyst's export report. */
export function defaultReports(projectId: string, at: string): SavedReport[] {
  const none = { combinator: 'and' as const, conditions: [] };
  return [
    {
      id: `report_signups_${projectId}`,
      projectId,
      name: 'Signups by plan',
      config: {
        eventType: 'signup',
        measure: 'events',
        breakdown: 'properties.plan',
        filter: none,
      },
      ownerId: 'user_0001',
      createdAt: at,
      updatedAt: at,
    },
    {
      id: `report_exports_${projectId}`,
      projectId,
      name: 'Report exports by country',
      config: {
        eventType: 'report_exported',
        measure: 'users',
        breakdown: 'properties.country',
        filter: none,
      },
      ownerId: 'user_0002',
      createdAt: at,
      updatedAt: at,
    },
  ];
}

/** Release notes on the timeline, `daysAgo` before the reference time (only those inside the history). */
export function releaseAnnotations(
  projectId: string,
  ref: number,
  historyDays: number
): Annotation[] {
  const DAY = 86_400_000;
  const notes: [number, string][] = [
    [62, 'v2.3: faster dashboards'],
    [40, 'v2.4: onboarding checklist'],
    [18, 'v2.5: scheduled report exports'],
  ];
  return notes
    .filter(([daysAgo]) => daysAgo < historyDays)
    .map(([daysAgo, title]) => ({
      id: `annotation_release_${daysAgo}_${projectId}`,
      projectId,
      at: new Date(Math.floor((ref - daysAgo * DAY) / DAY) * DAY + 12 * 3_600_000).toISOString(),
      title,
      kind: 'release' as const,
      authorId: 'user_0001',
    }));
}
