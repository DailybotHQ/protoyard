import { z } from 'zod';

/**
 * The `sheet` screen: an entity's records as a spreadsheet (one row per
 * record, one column per field), with a totals row that sums number, integer
 * and money columns, CSV download, and cell edits saved through the entity's
 * update service. Rendered by `@protoyard/crud/screens/sheet` over
 * `@protoyard/views-ui/sheet`.
 *
 * Kept in its own module so the screen union in `schema.ts` only names it.
 */

/** Field kinds whose cells can be edited (typed text is checked by the entity schema on save). */
export const SHEET_EDITABLE_KINDS = [
  'text',
  'longText',
  'number',
  'integer',
  'money',
  'boolean',
  'date',
  'enum',
  'email',
  'url',
  'phone',
] as const;

/** Field kinds a sheet shows read-only: their value is a label or a list, not one cell input. */
export const SHEET_READONLY_KINDS = ['datetime', 'relation', 'persona', 'tags'] as const;

/** Every field kind a sheet column may name. */
export const SHEET_COLUMN_KINDS: ReadonlySet<string> = new Set([
  ...SHEET_EDITABLE_KINDS,
  ...SHEET_READONLY_KINDS,
]);

/** Field kinds a totals row can sum. */
export const SHEET_TOTAL_KINDS: ReadonlySet<string> = new Set(['number', 'integer', 'money']);

/** At most this many columns (A–Z). */
export const SHEET_MAX_COLUMNS = 26;

/**
 * The screen's schema, built from `schema.ts`'s shared screen base and field
 * name rule (passed in, so this module imports nothing from `schema.ts`).
 */
export function sheetScreenSchema<Base extends z.ZodRawShape>(base: Base, fieldName: z.ZodString) {
  return z.strictObject({
    ...base,
    type: z.literal('sheet'),
    entity: z.string().min(1),
    /** Fields shown as columns, in order; omitted means every column the entity can show. */
    columns: z.array(fieldName).min(1).max(SHEET_MAX_COLUMNS).optional(),
    /** Number, integer or money columns summed in a totals row. */
    totals: z.array(fieldName).max(SHEET_MAX_COLUMNS).optional(),
  });
}

interface SheetFieldLike {
  name: string;
  kind: string;
}

/** Cross-reference issues for one sheet screen of `entity` (`add(path, message)`). */
export function sheetScreenIssues(
  entity: { name: string; fields: readonly SheetFieldLike[] },
  screen: { columns?: readonly string[] | undefined; totals?: readonly string[] | undefined },
  path: readonly (string | number)[],
  add: (path: (string | number)[], message: string) => void
): void {
  const fields = new Map(entity.fields.map((field) => [field.name, field]));
  const seen = new Set<string>();
  screen.columns?.forEach((name, j) => {
    const field = fields.get(name);
    if (!field) add([...path, 'columns', j], `unknown field "${name}" on "${entity.name}"`);
    else if (!SHEET_COLUMN_KINDS.has(field.kind)) {
      add([...path, 'columns', j], `a ${field.kind} field cannot be a sheet column ("${name}")`);
    }
    if (seen.has(name)) add([...path, 'columns', j], `duplicate column "${name}"`);
    seen.add(name);
  });
  const shown = new Set(screen.columns ?? sheetColumns(entity).map((field) => field.name));
  screen.totals?.forEach((name, j) => {
    const field = fields.get(name);
    if (!field) add([...path, 'totals', j], `unknown field "${name}" on "${entity.name}"`);
    else if (!SHEET_TOTAL_KINDS.has(field.kind)) {
      add([...path, 'totals', j], `totals "${name}" must be a number, integer or money field`);
    } else if (!shown.has(name)) {
      add([...path, 'totals', j], `totals "${name}" is not one of the sheet's columns`);
    }
  });
}

/** The columns a sheet shows: the listed ones, or every field a sheet can show (at most 26). */
export function sheetColumns<F extends SheetFieldLike>(
  entity: { fields: readonly F[] },
  columns?: readonly string[]
): F[] {
  if (columns) {
    const byName = new Map(entity.fields.map((field) => [field.name, field]));
    return columns.flatMap((name) => {
      const field = byName.get(name);
      return field ? [field] : [];
    });
  }
  return entity.fields
    .filter((field) => SHEET_COLUMN_KINDS.has(field.kind))
    .slice(0, SHEET_MAX_COLUMNS);
}
