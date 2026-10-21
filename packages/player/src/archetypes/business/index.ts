/** Business archetypes: the adapter only. Each kit loads from its own lazy entry (saas.ts, analytics.ts). */
export {
  type AnalyticsFields,
  type BusinessAdapter,
  type BusinessArchetype,
  createBusinessAdapter,
  isBusinessArchetype,
} from './adapter.ts';
export { type DashboardNumbers, dashboardNumbers } from './metrics.ts';
export { withArchetypeNav } from './nav.ts';
