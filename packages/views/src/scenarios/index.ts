/**
 * `@protoyard/views/scenarios` — deterministic generators for view-shaped
 * data (calendar series, task plans, Port Meridian geo, outlines, comments,
 * activity, notifications, file trees) and the scenario fragments that set
 * each kit's level. Driven only by the scenario seed, `ctx.ids` and
 * `ctx.time`; import it from a lazy generator module.
 */
export {
  type CalendarEventData,
  type CalendarEventsOptions,
  generateCalendarEvents,
} from './calendar.ts';
export { type FileEntry, type FileTreeOptions, generateFileTree } from './files.ts';
export {
  type GeoRoute,
  type GeoSite,
  type GeoWorld,
  type GeoWorldOptions,
  generateGeoWorld,
} from './geo.ts';
export {
  addWorkdays,
  generateTaskPlan,
  nextWorkday,
  type PlanDependency,
  type PlanTask,
  type TaskPlan,
  type TaskPlanOptions,
} from './plan.ts';
export {
  countFor,
  defaultPeople,
  VIEWS_GENERATOR_VERSION,
  VIEWS_KITS,
  type ViewsCtx,
  type ViewsFragment,
  type ViewsKit,
  type ViewsLevel,
  type ViewsPerson,
  viewsFragments,
  viewsLevel,
  viewsRng,
} from './shared.ts';
export {
  type ActivityRow,
  type ActivityVerb,
  type CommentRow,
  generateActivity,
  generateComments,
  generateNotifications,
  type NotificationRow,
  type SocialOptions,
  type ViewsSubject,
} from './social.ts';
export { generateOutline, type OutlineNode, type OutlineOptions } from './tree.ts';
