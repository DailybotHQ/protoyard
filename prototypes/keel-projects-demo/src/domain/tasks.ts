import {
  type Project,
  type ProjectColor,
  type Task,
  type TaskLabel,
  type TaskPriority,
  type TaskStatus,
} from '../database/schema.ts';

/** Pure, UI-independent task helpers (unit-testable without a runtime). */

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  'in-progress': 'In progress',
  review: 'Review',
  done: 'Done',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const LABEL_NAMES: Record<TaskLabel, string> = {
  bug: 'Bug',
  feature: 'Feature',
  design: 'Design',
  frontend: 'Frontend',
  backend: 'Backend',
  research: 'Research',
  docs: 'Docs',
  blocked: 'Blocked',
};

/** Tailwind classes per project color (dot + soft background), readable in light and dark. */
export const PROJECT_COLOR_CLASSES: Record<ProjectColor, { dot: string; soft: string }> = {
  violet: { dot: 'bg-violet-500', soft: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  blue: { dot: 'bg-blue-500', soft: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  teal: { dot: 'bg-teal-500', soft: 'bg-teal-500/10 text-teal-700 dark:text-teal-300' },
  amber: { dot: 'bg-amber-500', soft: 'bg-amber-500/10 text-amber-800 dark:text-amber-300' },
  rose: { dot: 'bg-rose-500', soft: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  slate: { dot: 'bg-slate-500', soft: 'bg-slate-500/10 text-slate-700 dark:text-slate-300' },
};

export const taskKey = (task: Pick<Task, 'number'>, project?: Pick<Project, 'key'>) =>
  `${project?.key ?? 'TASK'}-${task.number}`;

/** `YYYY-MM-DD` of the simulated "today" (UTC, like stored due dates). */
export const dayOf = (now: Date) => now.toISOString().slice(0, 10);

export type DueState = 'none' | 'overdue' | 'today' | 'soon' | 'later' | 'done';

/** Where a task's due date sits relative to the SIMULATED now. */
export function dueState(task: Pick<Task, 'dueDate' | 'status'>, now: Date): DueState {
  if (task.status === 'done') return 'done';
  if (!task.dueDate) return 'none';
  const today = dayOf(now);
  if (task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'today';
  const inAWeek = dayOf(new Date(now.getTime() + 7 * 86_400_000));
  return task.dueDate <= inAWeek ? 'soon' : 'later';
}

export const isOverdue = (task: Pick<Task, 'dueDate' | 'status'>, now: Date) =>
  dueState(task, now) === 'overdue';

export interface TaskFilter {
  query?: string;
  /** Persona id, `'unassigned'`, or empty for everyone. */
  assignee?: string;
  priority?: TaskPriority | '';
  label?: TaskLabel | '';
  overdueOnly?: boolean;
}

export function filterTasks(tasks: readonly Task[], filter: TaskFilter, now: Date): Task[] {
  const q = filter.query?.trim().toLowerCase() ?? '';
  return tasks.filter(
    (task) =>
      (!q || task.title.toLowerCase().includes(q) || task.description.toLowerCase().includes(q)) &&
      (!filter.assignee ||
        (filter.assignee === 'unassigned'
          ? task.assigneeId === null
          : task.assigneeId === filter.assignee)) &&
      (!filter.priority || task.priority === filter.priority) &&
      (!filter.label || task.labels.includes(filter.label)) &&
      (!filter.overdueOnly || isOverdue(task, now))
  );
}

/** Board order: explicit position, then priority, then id for stability. */
export function sortForBoard(tasks: readonly Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      a.order - b.order ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.id.localeCompare(b.id)
  );
}

/** "My tasks" order: due date first (no date last), then priority. */
export function sortByDue(tasks: readonly Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.id.localeCompare(b.id)
  );
}
