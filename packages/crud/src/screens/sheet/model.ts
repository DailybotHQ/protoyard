import {
  type BlueprintEntity,
  type BlueprintField,
  type BlueprintScreen,
  SHEET_EDITABLE_KINDS,
  sheetColumns,
} from '@protoyard/blueprint';
import type { Row } from '@protoyard/core';
import { fieldLabel, inputProperty } from '../../format.ts';

export type SheetScreenSpec = Extract<BlueprintScreen, { type: 'sheet' }>;

/** A cell input in Texuli's sheet format: a number, a boolean, text, or `=formula`. */
export type SheetCellInput = number | boolean | string;

export interface SheetColumn {
  field: BlueprintField;
  /** The column letter (`A`…`Z`). */
  letter: string;
  editable: boolean;
  total: boolean;
}

/** The workbook a sheet screen paints, and which record each data row shows. */
export interface SheetScreenModel {
  document: {
    format: 'texuli-sheet';
    formatVersion: 1;
    meta: { title: string };
    sheets: [
      {
        id: 'records';
        name: string;
        rows: number;
        columns: number;
        cells: Record<string, SheetCellInput>;
      },
    ];
  };
  columns: SheetColumn[];
  /** Record ids, in row order (sheet row 2 is `rowIds[0]`). */
  rowIds: string[];
}

const EDITABLE = new Set<string>(SHEET_EDITABLE_KINDS);
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function sheetLayout(entity: BlueprintEntity, screen: SheetScreenSpec): SheetColumn[] {
  const totals = new Set(screen.totals ?? []);
  return sheetColumns(entity, screen.columns).map((field, index) => ({
    field,
    letter: LETTERS[index] as string,
    editable: EDITABLE.has(field.kind),
    total: totals.has(field.name),
  }));
}

/**
 * Record text is untrusted: a value that would read as a formula (`=…`) or as
 * the literal-text marker (`'…`) is written with Texuli's leading `'`, so it
 * shows as typed and never evaluates.
 */
function textInput(value: string): string {
  return value.startsWith('=') || value.startsWith("'") ? `'${value}` : value;
}

/** One record value as a cell input; `undefined` leaves the cell blank. */
export function cellInput(
  field: BlueprintField,
  value: unknown,
  names?: ReadonlyMap<string, string>
): SheetCellInput | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  switch (field.kind) {
    case 'number':
    case 'integer':
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    case 'money':
      // Integer cents in the record; currency units in the sheet (sums stay exact to the cent).
      return typeof value === 'number' && Number.isFinite(value) ? value / 100 : undefined;
    case 'boolean':
      return value === true;
    case 'relation':
    case 'persona':
      return textInput(
        (Array.isArray(value) ? value : [value])
          .map((id) => names?.get(String(id)) ?? String(id))
          .join(', ')
      );
    case 'tags':
      return textInput(Array.isArray(value) ? value.join(', ') : String(value));
    default:
      return textInput(String(value));
  }
}

/** Records as one sheet: a header row, one row per record, then a totals row when any column sums. */
export function buildSheetModel(
  entity: BlueprintEntity,
  screen: SheetScreenSpec,
  rows: readonly Row[],
  title: string,
  displayNames: Readonly<Record<string, ReadonlyMap<string, string>>> = {}
): SheetScreenModel {
  const columns = sheetLayout(entity, screen);
  const cells: Record<string, SheetCellInput> = {};
  for (const column of columns) cells[`${column.letter}1`] = fieldLabel(column.field);
  rows.forEach((row, index) => {
    const at = index + 2;
    for (const column of columns) {
      const input = cellInput(
        column.field,
        row[inputProperty(column.field)],
        displayNames[column.field.name]
      );
      if (input !== undefined) cells[`${column.letter}${at}`] = input;
    }
  });
  const last = rows.length + 1;
  const totalsRow = last + 1;
  const totaled = columns.filter((column) => column.total);
  if (totaled.length > 0) {
    const label = columns.find((column) => !column.total);
    if (label) cells[`${label.letter}${totalsRow}`] = 'Total';
    for (const column of totaled) {
      cells[`${column.letter}${totalsRow}`] =
        rows.length > 0 ? `=SUM(${column.letter}2:${column.letter}${last})` : 0;
    }
  }
  return {
    document: {
      format: 'texuli-sheet',
      formatVersion: 1,
      meta: { title },
      sheets: [
        {
          id: 'records',
          name: entity.label ?? entity.plural,
          rows: totaled.length > 0 ? totalsRow : Math.max(last, 1),
          columns: Math.max(columns.length, 1),
          cells,
        },
      ],
    },
    columns,
    rowIds: rows.map((row) => String(row.id)),
  };
}

export type CellPatch = { ok: true; value: unknown } | { ok: false; message: string };

/**
 * What an edited cell saves to its field. Formulas never reach a record (a
 * record holds data); numbers, money (to integer cents), booleans, dates and
 * enum values are checked here, and the entity service validates the rest.
 */
export function cellPatch(field: BlueprintField, input: SheetCellInput | undefined): CellPatch {
  if (typeof input === 'string' && input.startsWith('=')) {
    return { ok: false, message: `${fieldLabel(field)} keeps a value, not a formula.` };
  }
  const text = typeof input === 'string' ? (input.startsWith("'") ? input.slice(1) : input) : input;
  if (text === undefined || text === '') return { ok: true, value: null };
  switch (field.kind) {
    case 'number':
    case 'integer':
    case 'money': {
      const number = typeof text === 'number' ? text : Number(String(text).trim());
      if (typeof text === 'boolean' || !Number.isFinite(number)) {
        return { ok: false, message: `${fieldLabel(field)} takes a number.` };
      }
      if (field.kind === 'integer' && !Number.isInteger(number)) {
        return { ok: false, message: `${fieldLabel(field)} takes a whole number.` };
      }
      return { ok: true, value: field.kind === 'money' ? Math.round(number * 100) : number };
    }
    case 'boolean':
      if (typeof text === 'boolean') return { ok: true, value: text };
      return { ok: false, message: `${fieldLabel(field)} takes TRUE or FALSE.` };
    case 'date':
      if (typeof text === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text.trim())) {
        return { ok: true, value: text.trim() };
      }
      return { ok: false, message: `${fieldLabel(field)} takes a date like 2026-10-31.` };
    case 'enum':
      if (field.values.includes(String(text))) return { ok: true, value: String(text) };
      return {
        ok: false,
        message: `${fieldLabel(field)} takes one of: ${field.values.join(', ')}.`,
      };
    default:
      return { ok: true, value: String(text) };
  }
}

export interface SheetEdit {
  id: string;
  field: BlueprintField;
  input: SheetCellInput | undefined;
}

/**
 * The record cells an edited workbook changed: editable columns of record
 * rows only. Headers, the totals row and cells outside the records are not
 * record data, so they are ignored (the screen repaints from the records).
 */
export function sheetEdits(
  model: SheetScreenModel,
  next: { sheets: readonly { id: string; cells?: Readonly<Record<string, unknown>> }[] }
): SheetEdit[] {
  const before = model.document.sheets[0].cells;
  const after = next.sheets.find((sheet) => sheet.id === 'records')?.cells ?? {};
  const edits: SheetEdit[] = [];
  model.rowIds.forEach((id, index) => {
    const at = index + 2;
    for (const column of model.columns) {
      if (!column.editable) continue;
      const address = `${column.letter}${at}`;
      const value = after[address];
      if (before[address] !== value) {
        const input =
          typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string'
            ? value
            : undefined;
        edits.push({ id, field: column.field, input });
      }
    }
  });
  return edits;
}

export type SheetPatch =
  | { ok: true; id: string; patch: Record<string, unknown> }
  | { ok: false; message: string };

/**
 * The one record patch an edit makes, or why it is refused. Each record saves
 * through its own service call and transaction, so an edit that spans several
 * records (a pasted range) is refused whole instead of being stored in part.
 */
export function sheetPatch(edits: readonly SheetEdit[]): SheetPatch {
  if (edits.length === 0) {
    return {
      ok: false,
      message: 'Only record cells can be edited here; headers and totals follow the records.',
    };
  }
  const ids = new Set(edits.map((edit) => edit.id));
  const [id] = ids;
  if (id === undefined || ids.size > 1) {
    return {
      ok: false,
      message: 'Edit one record at a time: a change that spans several rows is not saved.',
    };
  }
  const patch: Record<string, unknown> = {};
  for (const edit of edits) {
    const value = cellPatch(edit.field, edit.input);
    if (!value.ok) return value;
    patch[edit.field.name] = value.value;
  }
  return { ok: true, id, patch };
}
