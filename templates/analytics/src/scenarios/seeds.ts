import type { DashboardLayout } from '@protoyard/analytics';
import type { SavedSegment } from '../database/schema.ts';

/** Widget keys the Overview knows how to render (see `src/widgets/registry.ts`). */
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

/** Two saved segments: one by the owner, one by the member (so ownership rules show). */
export function defaultSegments(at: string): SavedSegment[] {
  return [
    {
      id: 'segment_paid',
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
      id: 'segment_mobile',
      name: 'Mobile apps',
      filter: {
        combinator: 'and',
        conditions: [{ property: 'properties.platform', operator: 'neq', value: 'web' }],
      },
      ownerId: 'user_0003',
      createdAt: at,
      updatedAt: at,
    },
  ];
}
