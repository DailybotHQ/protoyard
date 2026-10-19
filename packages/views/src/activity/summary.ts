/** Placeholder the blueprint audit stores instead of a sensitive value. */
export const REDACTED = '[redacted]';

export type ActivityKind =
  | 'comment'
  | 'create'
  | 'update'
  | 'delete'
  | 'restore'
  | 'purge'
  | 'import';
export const ACTIVITY_KINDS: readonly ActivityKind[] = [
  'comment',
  'create',
  'update',
  'delete',
  'restore',
  'purge',
  'import',
];

/** One row of a feed. `lines` are plain text; a comment keeps its stored `body` (with id tokens). */
export interface ActivityItem {
  id: string;
  at: string;
  actorId: string;
  kind: ActivityKind;
  entity?: string;
  recordId?: string;
  /** What the record is called ("Renewal for Acme"), when known. */
  recordLabel?: string;
  lines: string[];
  body?: string;
  /** Tie-break for items at the same instant (higher is newer). */
  seq?: number;
}

export interface FieldChange {
  before: unknown;
  after: unknown;
}

/** The shape of a blueprint audit row (`@protoyard/blueprint` `AuditEntry`), restated so this engine stays dependency-free. */
export interface AuditRowLike {
  id: string;
  entity: string;
  recordId: string;
  actorId: string;
  action: 'create' | 'update' | 'delete' | 'restore' | 'purge' | 'import';
  at: string;
  seq?: number;
  changes: Record<string, FieldChange>;
}

export interface SummaryOptions {
  /** "status" → "Status" (default: the key, split into words). */
  fieldLabel?: (field: string) => string;
  /** Display text for a value (default: by type, at most 60 characters). */
  formatValue?: (field: string, value: unknown) => string;
  /** Changes listed before "and N more changes" (default 3). */
  maxLines?: number;
}

const empty = (value: unknown) =>
  value === null ||
  value === undefined ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

function words(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .trim();
}

/** Plain display text for a changed value. */
export function valueText(value: unknown): string {
  let text: string;
  if (typeof value === 'boolean') text = value ? 'Yes' : 'No';
  else if (typeof value === 'number')
    text = Number.isFinite(value) ? value.toLocaleString('en') : String(value);
  else if (Array.isArray(value)) text = value.map(valueText).join(', ');
  else if (typeof value === 'string') text = value;
  else if (value === null || value === undefined) text = '';
  else text = 'a new value';
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? `${flat.slice(0, 59)}…` : flat;
}

/** One sentence for one field: "changed status from Open to Won", "set owner to Marta", "cleared due date". */
export function describeChange(
  field: string,
  change: FieldChange,
  options: SummaryOptions = {}
): string {
  const label = options.fieldLabel?.(field) ?? words(field);
  if (change.before === REDACTED || change.after === REDACTED) return `changed ${label}`;
  const format = (value: unknown) => options.formatValue?.(field, value) ?? valueText(value);
  if (empty(change.before) && empty(change.after)) return `changed ${label}`;
  if (empty(change.before)) return `set ${label} to ${format(change.after)}`;
  if (empty(change.after)) return `cleared ${label}`;
  return `changed ${label} from ${format(change.before)} to ${format(change.after)}`;
}

const VERBS: Record<Exclude<ActivityKind, 'comment' | 'update'>, string> = {
  create: 'created',
  delete: 'deleted',
  restore: 'restored',
  purge: 'permanently deleted',
  import: 'imported',
};

/** The lines for one audit row: each changed field for an update, one verb otherwise. */
export function summarizeChanges(
  action: AuditRowLike['action'],
  changes: Record<string, FieldChange>,
  options: SummaryOptions = {}
): string[] {
  if (action !== 'update') return [VERBS[action]];
  const keys = Object.keys(changes).sort();
  if (keys.length === 0) return ['updated'];
  const max = Math.max(1, options.maxLines ?? 3);
  const shown = keys.length > max ? keys.slice(0, max - 1) : keys;
  const lines = shown.map((key) => describeChange(key, changes[key] as FieldChange, options));
  const rest = keys.length - shown.length;
  if (rest > 0) lines.push(`and ${rest} more ${rest === 1 ? 'change' : 'changes'}`);
  return lines;
}

/** Adapts a blueprint audit row to a feed item. */
export function auditToActivity(
  row: AuditRowLike,
  options: SummaryOptions & { recordLabel?: (row: AuditRowLike) => string | undefined } = {}
): ActivityItem {
  const recordLabel = options.recordLabel?.(row);
  return {
    id: row.id,
    at: row.at,
    actorId: row.actorId,
    kind: row.action,
    entity: row.entity,
    recordId: row.recordId,
    ...(recordLabel ? { recordLabel } : {}),
    lines: summarizeChanges(row.action, row.changes ?? {}, options),
    ...(row.seq === undefined ? {} : { seq: row.seq }),
  };
}

/** Newest first: by time, then `seq`, then id. Returns a new array. */
export function sortActivity<T extends Pick<ActivityItem, 'at' | 'id' | 'seq'>>(
  items: readonly T[]
): T[] {
  return [...items].sort((a, b) => {
    const ta = Date.parse(a.at);
    const tb = Date.parse(b.at);
    if (ta !== tb) return tb - ta;
    if ((a.seq ?? 0) !== (b.seq ?? 0)) return (b.seq ?? 0) - (a.seq ?? 0);
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

export interface ActivityFilter {
  /** Kinds to keep; empty or missing keeps all. */
  kinds?: readonly ActivityKind[];
  actorId?: string | null;
  recordId?: string | null;
}

export function filterActivity<T extends ActivityItem>(
  items: readonly T[],
  filter: ActivityFilter
): T[] {
  const kinds = filter.kinds?.length ? new Set(filter.kinds) : null;
  return items.filter(
    (item) =>
      (!kinds || kinds.has(item.kind)) &&
      (!filter.actorId || item.actorId === filter.actorId) &&
      (!filter.recordId || item.recordId === filter.recordId)
  );
}
