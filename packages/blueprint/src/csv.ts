import { parseInput, ValidationError } from '@protoyard/core';
import type { BlueprintEntity, BlueprintField } from './schema.ts';
import { deriveInputSchemas, type EntityInput, fieldLabel, inputProperty } from './validation.ts';

/**
 * Dependency-free RFC 4180 CSV codec for blueprint import/export.
 * Load via `import('@protoyard/blueprint/csv')` so the main blueprint entry
 * stays free of this code until the user opens import/export.
 */

/** Default hard limits — override per call when a larger demo is intentional. */
export const CSV_MAX_BYTES = 2 * 1024 * 1024;
export const CSV_MAX_ROWS = 10_000;

const FORMULA_PREFIX = /^(?:[=@\t\r]|[+-](?!\d))/;

export type CsvErrorCode = 'too-large' | 'too-many-rows' | 'empty' | 'header' | 'parse' | 'columns';

export class CsvError extends Error {
  readonly code: CsvErrorCode;
  constructor(code: CsvErrorCode, message: string) {
    super(message);
    this.name = 'CsvError';
    this.code = code;
  }
}

export interface CsvLimits {
  maxBytes?: number;
  /** Data rows only (header is not counted). */
  maxRows?: number;
}

export interface CsvParseOptions extends CsvLimits {
  /** When false, leave leading BOM in the first cell (default strips it). */
  keepBom?: boolean;
}

export interface CsvSerializeOptions {
  /**
   * Prefix cells that start with `= + - @` with a single quote so spreadsheets
   * do not treat them as formulas (default true).
   */
  guardFormulas?: boolean;
  /** Line ending (default `\r\n` per RFC 4180). */
  newline?: '\r\n' | '\n';
}

export interface CsvColumn {
  /** Row / input property (`customerId`, `subject`, …). */
  property: string;
  /** Header text written on export / matched on import. */
  header: string;
  field?: BlueprintField;
  /** Geo fields export as two columns, `<name>Lat` and `<name>Lng`. */
  part?: 'lat' | 'lng';
}

export interface CsvRowError {
  /** 1-based data row index (first row after the header is 1). */
  row: number;
  /** Input property or `form` / `row` for whole-row problems. */
  field: string;
  message: string;
}

export interface CsvValidationResult {
  headers: string[];
  columns: CsvColumn[];
  /** Successfully validated create-shaped rows (coerced). */
  valid: EntityInput[];
  errors: CsvRowError[];
  /** Total data rows seen (valid + invalid). */
  rowCount: number;
}

function assertLimits(text: string, limits: CsvLimits = {}): void {
  const maxBytes = limits.maxBytes ?? CSV_MAX_BYTES;
  const bytes =
    typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : text.length;
  if (bytes > maxBytes) {
    throw new CsvError(
      'too-large',
      `CSV is ${bytes.toLocaleString()} bytes; the limit is ${maxBytes.toLocaleString()} bytes`
    );
  }
}

/**
 * Parse RFC 4180 CSV into a matrix of cell strings.
 * Handles quoted fields, escaped quotes (`""`), CRLF / LF / CR, and a leading BOM.
 */
export function parseCsv(text: string, options: CsvParseOptions = {}): string[][] {
  assertLimits(text, options);
  let source = text;
  if (!options.keepBom && source.charCodeAt(0) === 0xfeff) {
    source = source.slice(1);
  }
  if (source.length === 0) {
    throw new CsvError('empty', 'CSV is empty');
  }

  const maxRows = options.maxRows ?? CSV_MAX_ROWS;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    // A trailing newline after the last row yields an empty trailing row — drop it.
    if (row.length === 1 && row[0] === '' && rows.length > 0 && i >= source.length) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
    // Header + data rows: allow header free, then enforce max data rows.
    if (rows.length > maxRows + 1) {
      throw new CsvError(
        'too-many-rows',
        `CSV has more than ${maxRows.toLocaleString()} data rows; split the file or raise maxRows`
      );
    }
  };

  while (i < source.length) {
    const ch = source[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      pushField();
      pushRow();
      if (ch === '\r' && source[i + 1] === '\n') i += 2;
      else i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  if (inQuotes) {
    throw new CsvError('parse', 'CSV ends inside a quoted field (missing closing quote)');
  }
  // Final field/row when the file does not end with a newline.
  if (field.length > 0 || row.length > 0 || source.endsWith(',')) {
    pushField();
    // Avoid double-pushing an empty row when the file ended with a newline
    // (pushRow already ran) and we have nothing left.
    if (row.length > 1 || (row.length === 1 && (row[0] !== '' || rows.length === 0))) {
      pushRow();
    } else if (row.length === 1 && row[0] === '' && rows.length === 0) {
      pushRow();
    }
  }

  if (rows.length === 0) {
    throw new CsvError('empty', 'CSV has no rows');
  }
  return rows;
}

/** Escape one cell for RFC 4180; optionally neutralize spreadsheet formulas. */
export function escapeCsvCell(value: unknown, options: CsvSerializeOptions = {}): string {
  let text = value === null || value === undefined ? '' : String(value);
  const guard = options.guardFormulas !== false;
  if (guard && text.length > 0 && FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Serialize a matrix of cells to CSV text (CRLF by default). */
export function serializeCsv(
  rows: readonly (readonly unknown[])[],
  options: CsvSerializeOptions = {}
): string {
  const newline = options.newline ?? '\r\n';
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell, options)).join(',')).join(newline);
}

/** Format a row value for export (money as major units, tags joined, …). */
export function formatCsvValue(value: unknown, field?: BlueprintField): string {
  if (value === null || value === undefined) return '';
  if (field?.kind === 'money' && typeof value === 'number') {
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    return `${sign}${(abs / 100).toFixed(2)}`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.map(String).join(',');
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Columns for an entity: header is label (or name), property is the input key. */
export function entityCsvColumns(entity: BlueprintEntity): CsvColumn[] {
  return entity.fields.flatMap((field): CsvColumn[] =>
    field.kind === 'geo'
      ? (['lat', 'lng'] as const).map((part) => ({
          property: inputProperty(field),
          header: `${field.name}${part === 'lat' ? 'Lat' : 'Lng'}`,
          field,
          part,
        }))
      : [{ property: inputProperty(field), header: fieldLabel(field), field }]
  );
}

/** Header keys a column answers to (case-insensitive). */
function columnKeys(col: CsvColumn): string[] {
  if (col.part && col.field) {
    const suffix = col.part === 'lat' ? 'lat' : 'lng';
    return [col.header, `${col.field.name} ${suffix}`, `${fieldLabel(col.field)} ${suffix}`];
  }
  return [col.property, col.header, col.field?.name, col.field?.label].filter(
    (k): k is string => typeof k === 'string' && k.length > 0
  );
}

const columnId = (col: CsvColumn) => (col.part ? `${col.property}.${col.part}` : col.property);

/**
 * Map header cells to entity columns by case-insensitive match on field name,
 * input property, or label.
 */
export function mapCsvHeaders(headers: string[], entity: BlueprintEntity): CsvColumn[] {
  if (headers.length === 0 || headers.every((h) => h.trim() === '')) {
    throw new CsvError('header', 'CSV has no header row');
  }
  const columns = entityCsvColumns(entity);
  const byKey = new Map<string, CsvColumn>();
  for (const col of columns) {
    for (const key of columnKeys(col)) {
      byKey.set(key.trim().toLowerCase(), col);
    }
  }

  const mapped: CsvColumn[] = [];
  const seen = new Set<string>();
  for (const header of headers) {
    const key = header.trim().toLowerCase();
    if (!key) {
      mapped.push({ property: '', header, field: undefined });
      continue;
    }
    const col = byKey.get(key);
    if (!col) {
      throw new CsvError(
        'header',
        `Unknown CSV column "${header}". Expected field names or labels such as ${columns
          .slice(0, 5)
          .map((c) => c.header)
          .join(', ')}`
      );
    }
    if (seen.has(columnId(col))) {
      throw new CsvError('header', `Duplicate CSV column for "${col.header}"`);
    }
    seen.add(columnId(col));
    mapped.push({ ...col, header });
  }
  return mapped;
}

/** Serialize entity-shaped records using the entity's column headers. */
export function serializeEntityCsv(
  entity: BlueprintEntity,
  records: readonly EntityInput[],
  options: CsvSerializeOptions = {}
): string {
  const columns = entityCsvColumns(entity);
  const header = columns.map((c) => c.header);
  const body = records.map((record) =>
    columns.map((col) => {
      const value = record[col.property];
      if (!col.part) return formatCsvValue(value, col.field);
      const point = value as { lat?: unknown; lng?: unknown } | null | undefined;
      return formatCsvValue(point?.[col.part]);
    })
  );
  return serializeCsv([header, ...body], options);
}

/**
 * Parse CSV text and validate each data row against the entity's create schema.
 * Unknown columns fail at the header; per-cell issues become `{ row, field, message }`.
 */
export function validateCsv(
  entity: BlueprintEntity,
  text: string,
  options: CsvParseOptions = {}
): CsvValidationResult {
  const matrix = parseCsv(text, options);
  const [headerRow, ...dataRows] = matrix;
  if (!headerRow) {
    throw new CsvError('empty', 'CSV has no header row');
  }
  const columns = mapCsvHeaders(headerRow, entity);
  const { create } = deriveInputSchemas(entity);
  const valid: EntityInput[] = [];
  const errors: CsvRowError[] = [];

  dataRows.forEach((cells, index) => {
    const rowNumber = index + 1;
    // Skip fully empty lines (common trailing artifact).
    if (cells.every((c) => c.trim() === '')) return;

    const input: EntityInput = {};
    columns.forEach((col, colIndex) => {
      if (!col.property) return;
      const raw = cells[colIndex] ?? '';
      if (col.part) {
        // Both halves of a geo point land in one `{ lat, lng }` input.
        const point = (input[col.property] ?? {}) as Record<string, string>;
        input[col.property] = { ...point, [col.part]: raw };
      } else {
        input[col.property] = raw;
      }
    });

    try {
      valid.push(parseInput(create, input));
    } catch (error) {
      if (error instanceof ValidationError) {
        for (const [field, message] of Object.entries(error.issues)) {
          errors.push({ row: rowNumber, field, message });
        }
      } else {
        errors.push({
          row: rowNumber,
          field: 'row',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });

  return {
    headers: headerRow,
    columns,
    valid,
    errors,
    rowCount: dataRows.filter((cells) => !cells.every((c) => c.trim() === '')).length,
  };
}
