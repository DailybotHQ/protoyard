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
/**
 * A project's color drawn through design-system tones (Avatar `tone`, Badge
 * `variant`), so the six project colors follow the theme instead of a fixed
 * palette. Texuli has no categorical palette prop, so each color takes the
 * nearest role tone.
 */
export type ProjectTone = 'primary' | 'info' | 'success' | 'warning' | 'destructive' | 'neutral';
export const PROJECT_COLOR_TONES: Record<ProjectColor, ProjectTone> = {
  violet: 'primary',
  blue: 'info',
  teal: 'success',
  amber: 'warning',
  rose: 'destructive',
  slate: 'neutral',
};
/** The Badge variant for a project color (`primary` is Badge's `default`). */
export const projectBadgeVariant = (color: ProjectColor) => {
  const tone = PROJECT_COLOR_TONES[color];
  return tone === 'primary' ? 'default' : tone;
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
