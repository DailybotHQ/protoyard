/**
 * `@protoyard/views/timeline` — thin re-export of `@texuli/data/timeline/engine`
 * (working-day schedules, dependencies, critical path, cascade).
 * `@protoyard/views-ui/timeline` renders it.
 */
export {
  type CascadeResult,
  type CriticalPath,
  cascade,
  criticalPath,
  cycleMessage,
  DEPENDENCY_TYPES,
  type Dependency,
  DependencyListSchema,
  DependencySchema,
  type DependencyType,
  durationDays,
  type ScheduleInfo,
  type ScheduleTask,
  type TaskChange,
  type TimelineItem,
  type TimelineModel,
  type TopoResult,
  timelineModel,
  topoOrder,
  type WorkCalendar,
  type WorkDays,
  workDays,
} from '@texuli/data/timeline/engine';
