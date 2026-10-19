import type { GridColumnDef } from '@protoyard/views/grid';
import { TASK_PRIORITIES, TASK_STATUSES } from '../database/schema.ts';

/**
 * The task grid's columns, shared by the screen (renders them), the services
 * (validate saved views and cell edits against them) and the generator
 * (seeds saved views). Keys are stable: saved views store them.
 */
export const TASK_GRID_COLUMNS = [
  { key: 'key', header: 'Key', type: 'text', width: 96 },
  { key: 'title', header: 'Title', type: 'text', width: 320 },
  { key: 'project', header: 'Project', type: 'text', width: 180 },
  { key: 'status', header: 'Status', type: 'enum', options: TASK_STATUSES, width: 130 },
  { key: 'priority', header: 'Priority', type: 'enum', options: TASK_PRIORITIES, width: 110 },
  { key: 'assignee', header: 'Assignee', type: 'text', width: 160 },
  { key: 'due', header: 'Due', type: 'date', width: 120 },
  { key: 'estimate', header: 'Estimate (h)', type: 'number', width: 120 },
] as const satisfies readonly Omit<GridColumnDef<unknown>, 'accessor'>[];

export type TaskGridKey = (typeof TASK_GRID_COLUMNS)[number]['key'];

/** Cells a person may edit from the grid (through `tasks.setField`). */
export const EDITABLE_GRID_KEYS = ['title', 'status', 'priority'] as const;
export type EditableGridKey = (typeof EDITABLE_GRID_KEYS)[number];
