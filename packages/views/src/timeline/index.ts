/**
 * `@protoyard/views/timeline` — scheduling for timelines and gantt charts:
 * working-day calendars, FS / SS / FF / SF dependencies with lag, topological
 * order with readable cycle errors (and a zod list schema that rejects
 * cycles), the critical path with slack, and cascading a move to the
 * successors it pushes. `@protoyard/views-ui/timeline` renders it.
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
  type TopoResult,
  topoOrder,
  type WorkCalendar,
  type WorkDays,
  workDays,
} from './schedule.ts';
