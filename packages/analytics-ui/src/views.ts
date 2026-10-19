/**
 * Analytics views, one lazy subpath each (`@protoyard/analytics-ui/<view>`).
 * The root entry never imports a view, so a prototype pays only for the
 * views its screens import.
 */
export const ANALYTICS_VIEWS = ['date-range', 'filters', 'cohort', 'funnel', 'grid'] as const;

export type AnalyticsView = (typeof ANALYTICS_VIEWS)[number];
