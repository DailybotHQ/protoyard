import type { PropertyCatalog } from '@protoyard/analytics';
import { COUNTRIES, EVENT_TYPES, PLANS, PLATFORMS } from '../database/schema.ts';

/** Human names for event types, used in selectors, tables and chart labels. */
export const EVENT_LABELS: Record<string, string> = {
  signup: 'Signed up',
  project_created: 'Created a project',
  invite_sent: 'Invited a teammate',
  upgraded: 'Upgraded',
  page_view: 'Viewed a page',
  feature_used: 'Used a feature',
  report_exported: 'Exported a report',
};

const option = (value: string, label = value) => ({ value, label });

/** Filterable event properties (FilterBuilder `properties`). */
export const EVENT_PROPERTIES = [
  {
    path: 'type',
    label: 'Event',
    type: 'string',
    options: EVENT_TYPES.map((t) => option(t, EVENT_LABELS[t])),
  },
  {
    path: 'properties.plan',
    label: 'Plan',
    type: 'string',
    options: PLANS.map((p) => option(p, p[0]?.toUpperCase() + p.slice(1))),
  },
  {
    path: 'properties.country',
    label: 'Country',
    type: 'string',
    options: COUNTRIES.map((c) => option(c)),
  },
  {
    path: 'properties.platform',
    label: 'Platform',
    type: 'string',
    options: PLATFORMS.map((p) => option(p)),
  },
] as const satisfies readonly {
  path: string;
  label: string;
  type: 'string';
  options: readonly { value: string; label: string }[];
}[];

export const EVENT_CATALOG: PropertyCatalog = Object.fromEntries(
  EVENT_PROPERTIES.map((p) => [p.path, p.type])
);

/** Funnel steps, in order (each is an event type). */
export const ACTIVATION_FUNNEL = [
  { id: 'signup', label: 'Signed up', eventType: 'signup' },
  { id: 'project', label: 'Created a project', eventType: 'project_created' },
  { id: 'invite', label: 'Invited a teammate', eventType: 'invite_sent' },
  { id: 'upgrade', label: 'Upgraded', eventType: 'upgraded' },
];

/** The live counter the timeline moves. */
export const LIVE_COUNTER = 'active_users';
