import type { BlueprintEntity, BlueprintScreen } from '@protoyard/blueprint';
import type { Row } from '@protoyard/core';
import type { IsoDate } from '@protoyard/views/calendar';
import type { ScheduleTask } from '@protoyard/views/timeline';

export type TimelineScreenSpec = Extract<BlueprintScreen, { type: 'timeline' }>;

export interface TimelineRecord extends ScheduleTask {
  title: string;
  row: Row;
}

export interface TimelineGroup {
  key: string;
  label: string;
  tasks: TimelineRecord[];
}

function civilDate(value: unknown): IsoDate | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return null;
  }
  return date as IsoDate;
}

/** Convert valid dated records to civil-day timeline tasks; an empty end is a milestone. */
export function rowToTimelineTask(
  row: Row,
  entity: BlueprintEntity,
  screen: TimelineScreenSpec
): TimelineRecord | null {
  const start = civilDate(row[screen.startField]);
  if (!start) return null;
  const end = civilDate(screen.endField ? row[screen.endField] : undefined);
  const title = String(row[entity.titleField] ?? '').trim() || 'Untitled';
  return {
    id: String(row.id),
    title,
    row,
    start,
    end: end && end >= start ? end : start,
    ...(!end || end < start ? { milestone: true } : {}),
  };
}

/** Group and order records predictably; enum values follow their blueprint declaration. */
export function groupTimelineRows(
  rows: readonly Row[],
  entity: BlueprintEntity,
  screen: TimelineScreenSpec
): TimelineGroup[] {
  const groups = new Map<string, TimelineGroup>();
  const groupField = entity.fields.find((field) => field.name === screen.groupBy);
  const orderedKeys = groupField?.kind === 'enum' ? groupField.values : [];

  for (const row of rows) {
    const task = rowToTimelineTask(row, entity, screen);
    if (!task) continue;
    const rawKey = screen.groupBy ? String(row[screen.groupBy] ?? '') : '';
    const key = rawKey || '__ungrouped__';
    const label =
      key === '__ungrouped__'
        ? screen.groupBy
          ? 'Unassigned'
          : 'All records'
        : groupField?.kind === 'enum'
          ? (groupField.labels?.[rawKey] ?? rawKey)
          : rawKey;
    const group = groups.get(key) ?? { key, label, tasks: [] };
    group.tasks.push(task);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      tasks: [...group.tasks].sort(
        (a, b) =>
          (a.start < b.start ? -1 : a.start > b.start ? 1 : 0) ||
          (a.title < b.title ? -1 : a.title > b.title ? 1 : 0) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      ),
    }))
    .sort((a, b) => {
      const ai = orderedKeys.indexOf(a.key);
      const bi = orderedKeys.indexOf(b.key);
      if (ai >= 0 || bi >= 0) return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi);
      return a.label < b.label
        ? -1
        : a.label > b.label
          ? 1
          : a.key < b.key
            ? -1
            : a.key > b.key
              ? 1
              : 0;
    });
}

/** Date or datetime field patch preserving the original time portion for datetime fields. */
export function timelineDatePatch(
  entity: BlueprintEntity,
  screen: TimelineScreenSpec,
  task: TimelineRecord,
  start: IsoDate,
  end: IsoDate
): Record<string, string> {
  const startField = entity.fields.find((field) => field.name === screen.startField);
  const endField = entity.fields.find((field) => field.name === screen.endField);
  const atTime = (fieldName: string, field: typeof startField, date: IsoDate): string => {
    const old = task.row[fieldName];
    if (field?.kind !== 'datetime') return date;
    const time =
      typeof old === 'string' && old.includes('T') ? old.slice(old.indexOf('T')) : 'T00:00:00.000Z';
    return `${date}${time}`;
  };
  return {
    [screen.startField]: atTime(screen.startField, startField, start),
    ...(screen.endField ? { [screen.endField]: atTime(screen.endField, endField, end) } : {}),
  };
}
