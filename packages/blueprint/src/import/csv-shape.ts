import { CSV_MAX_BYTES, CSV_MAX_ROWS, type CsvParseOptions, parseCsv } from '../csv.ts';
import {
  CSV_SHAPE_MAX_CELL_BYTES,
  CSV_SHAPE_MAX_COLUMNS,
  CSV_SHAPE_MAX_SAMPLE_ROWS,
  unguardCsvFormula,
} from '../csv-guard.ts';
import { type BlueprintEntity, type BlueprintField, parseBlueprint } from '../schema.ts';

export {
  CSV_SHAPE_MAX_CELL_BYTES,
  CSV_SHAPE_MAX_COLUMNS,
  CSV_SHAPE_MAX_SAMPLE_ROWS,
} from '../csv-guard.ts';

/** Options for bounded, data-shape-only CSV inference. */
export interface CsvShapeOptions {
  /** Name for the returned entity; normalized to blueprint kebab-case. */
  entityName?: string;
  /** Optional human label for the returned entity. */
  entityLabel?: string;
  /** Maximum bytes accepted by the existing CSV parser. Never exceeds 2 MiB. */
  maxBytes?: number;
  /** Number of non-empty data rows inspected for inference. Never exceeds 100. */
  maxSampleRows?: number;
  /** Maximum number of header columns. Never exceeds 100. */
  maxColumns?: number;
  /** Maximum UTF-8 bytes retained transiently for one sample cell. */
  maxCellBytes?: number;
}

export type CsvShapeErrorCode = 'too-many-columns' | 'cell-too-large' | 'invalid-options';

export class CsvShapeError extends Error {
  readonly code: CsvShapeErrorCode;

  constructor(code: CsvShapeErrorCode, message: string) {
    super(message);
    this.name = 'CsvShapeError';
    this.code = code;
  }
}

export interface CsvShapeResult {
  /** A validated entity draft; imported cell values are deliberately absent. */
  entity: BlueprintEntity;
  /** Review notes for uncertain or intentionally conservative inferences. */
  notes: string[];
  /** Number of non-empty data rows inspected, not retained. */
  rowsInspected: number;
  /** Number of columns represented by the draft. */
  columns: number;
}

type SampleKind = BlueprintField['kind'];

const TITLE_KINDS = new Set<SampleKind>(['text', 'email', 'url', 'phone', 'enum', 'integer']);
const SEARCHABLE_KINDS = new Set<SampleKind>(['text', 'email', 'url', 'phone', 'enum']);
const RESERVED_NAMES = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt', 'deletedBy']);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_PATTERN = /^https?:\/\/[^\s]+$/i;
const PHONE_PATTERN = /^\+?[0-9().\-\s]{7,}$/;
const INTEGER_PATTERN = /^[+-]?\d+$/;
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function bytes(text: string): number {
  return typeof TextEncoder === 'undefined' ? text.length : new TextEncoder().encode(text).length;
}

function bounded(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 1) {
    throw new CsvShapeError('invalid-options', 'CSV shape limits must be positive finite numbers');
  }
  return Math.min(Math.floor(value), maximum);
}

function words(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function fieldName(header: string, index: number, used: Set<string>): string {
  const parts = words(header);
  let name = parts
    .map((part, partIndex) => {
      const lower = part.toLowerCase();
      return partIndex === 0 ? lower : `${lower[0]?.toUpperCase() ?? ''}${lower.slice(1)}`;
    })
    .join('');
  if (!name) name = `field${index + 1}`;
  if (/^\d/.test(name)) name = `field${name}`;
  if (RESERVED_NAMES.has(name)) name = `field${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`;
  const base = name;
  let suffix = 2;
  while (used.has(name)) name = `${base}${suffix++}`;
  used.add(name);
  return name;
}

function entityName(value: string | undefined): string {
  const parts = words(value ?? 'Imported records');
  const name = parts.map((part) => part.toLowerCase()).join('-');
  return name.replace(/^-+|-+$/g, '') || 'imported-record';
}

function humanLabel(value: string | undefined, fallback: string): string {
  const label = (value ?? fallback).trim().replace(/\s+/g, ' ');
  return label.slice(0, 60) || fallback;
}

function validDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function allMatch(values: readonly string[], pattern: RegExp, check?: (value: string) => boolean) {
  return (
    values.length > 0 && values.every((value) => pattern.test(value) && (check?.(value) ?? true))
  );
}

function headerMatches(header: string, pattern: RegExp): boolean {
  return pattern.test(header.toLowerCase().replace(/[^a-z0-9]+/g, ' '));
}

function inferField(
  header: string,
  samples: readonly string[],
  label: string,
  notes: string[]
): SampleKind {
  const normalized = samples.map((sample) => unguardCsvFormula(sample).trim()).filter(Boolean);
  if (normalized.length === 0) {
    notes.push(`${label}: no non-empty sample values; kept as text for review.`);
    return 'text';
  }

  if (headerMatches(header, /e ?mail|email address/) && allMatch(normalized, EMAIL_PATTERN)) {
    return 'email';
  }
  if (headerMatches(header, /url|uri|website|link/) && allMatch(normalized, URL_PATTERN)) {
    return 'url';
  }
  if (headerMatches(header, /phone|mobile|telephone/) && allMatch(normalized, PHONE_PATTERN)) {
    return 'phone';
  }
  if (
    headerMatches(header, /date|day|birthday|due/) &&
    allMatch(normalized, DATE_PATTERN, validDate)
  ) {
    return 'date';
  }
  if (
    headerMatches(header, /time|timestamp|created at|updated at/) &&
    allMatch(normalized, DATETIME_PATTERN, (value) => !Number.isNaN(Date.parse(value)))
  ) {
    return 'datetime';
  }
  if (
    headerMatches(header, /boolean|active|enabled|verified|archived|done/) &&
    allMatch(normalized, /^(?:true|false)$/i)
  ) {
    return 'boolean';
  }
  if (
    headerMatches(header, /tag|label|keyword/) &&
    normalized.some((value) => value.includes(','))
  ) {
    return 'tags';
  }
  if (allMatch(normalized, INTEGER_PATTERN)) {
    if (headerMatches(header, /amount|price|cost|revenue|total|budget|fee|salary|money/)) {
      return 'money';
    }
    return 'integer';
  }
  if (allMatch(normalized, NUMBER_PATTERN)) {
    if (headerMatches(header, /amount|price|cost|revenue|total|budget|fee|salary|money/)) {
      return 'money';
    }
    return 'number';
  }
  if (
    normalized.some((value) => value.length > 200) ||
    headerMatches(header, /body|description|notes|comment|details/)
  ) {
    return 'longText';
  }

  if (
    headerMatches(header, /email|url|phone|date|time|number|amount|price|active|enabled|tag/) ||
    normalized.some((value) => DATE_PATTERN.test(value) || NUMBER_PATTERN.test(value))
  ) {
    notes.push(`${label}: sample values were mixed or ambiguous; kept as text for review.`);
  }
  return 'text';
}

function fieldFor(name: string, label: string, kind: SampleKind): Record<string, unknown> {
  if (kind === 'money') return { name, label, kind, currency: 'USD' };
  if (kind === 'tags') return { name, label, kind, maxItems: 8 };
  if (kind === 'text') return { name, label, kind, maxLength: 200 };
  if (kind === 'longText') return { name, label, kind, maxLength: 10_000 };
  return { name, label, kind };
}

function parseLimits(options: CsvShapeOptions): {
  maxBytes: number;
  maxSampleRows: number;
  maxColumns: number;
  maxCellBytes: number;
} {
  return {
    maxBytes: bounded(options.maxBytes, CSV_MAX_BYTES, CSV_MAX_BYTES),
    maxSampleRows: bounded(
      options.maxSampleRows,
      CSV_SHAPE_MAX_SAMPLE_ROWS,
      CSV_SHAPE_MAX_SAMPLE_ROWS
    ),
    maxColumns: bounded(options.maxColumns, CSV_SHAPE_MAX_COLUMNS, CSV_SHAPE_MAX_COLUMNS),
    maxCellBytes: bounded(options.maxCellBytes, CSV_SHAPE_MAX_CELL_BYTES, CSV_SHAPE_MAX_CELL_BYTES),
  };
}

/**
 * Infer a validated, reviewable entity from CSV headers and a bounded sample.
 * The parser may read the complete bounded CSV input, but the result contains
 * only names, labels, kinds and conservative metadata — never cell values.
 */
export function inferCsvEntity(text: string, options: CsvShapeOptions = {}): CsvShapeResult {
  const limits = parseLimits(options);
  const parseOptions: CsvParseOptions = { maxBytes: limits.maxBytes, maxRows: CSV_MAX_ROWS };
  const [headers = [], ...rows] = parseCsv(text, parseOptions);
  if (headers.length === 0 || headers.every((header) => header.trim() === '')) {
    throw new CsvShapeError('invalid-options', 'CSV shape inference needs a non-empty header row');
  }
  if (headers.length > limits.maxColumns) {
    throw new CsvShapeError(
      'too-many-columns',
      `CSV has ${headers.length.toLocaleString()} columns; the limit is ${limits.maxColumns.toLocaleString()}`
    );
  }

  const rowsWithData = rows.filter((row) => row.some((cell) => cell.trim() !== ''));
  for (const row of rowsWithData.slice(0, limits.maxSampleRows)) {
    for (const cell of row.slice(0, headers.length)) {
      if (bytes(cell) > limits.maxCellBytes) {
        throw new CsvShapeError(
          'cell-too-large',
          `A CSV sample cell exceeds the ${limits.maxCellBytes.toLocaleString()}-byte limit`
        );
      }
    }
  }

  const notes: string[] = [];
  if (rowsWithData.length > limits.maxSampleRows) {
    notes.push(
      `Only the first ${limits.maxSampleRows.toLocaleString()} non-empty data rows were inspected.`
    );
  }
  const sampledRows = rowsWithData.slice(0, limits.maxSampleRows);
  const usedNames = new Set<string>();
  const fields: Record<string, unknown>[] = [];
  const fieldKinds: SampleKind[] = [];

  headers.forEach((rawHeader, index) => {
    const header = rawHeader.trim();
    const label = humanLabel(header, `Field ${index + 1}`);
    const name = fieldName(header, index, usedNames);
    if (name !== (words(header).join('') || `field${index + 1}`)) {
      notes.push(`${label}: normalized to the field name "${name}".`);
    }
    const samples = sampledRows.map((row) => row[index] ?? '');
    const kind = inferField(header, samples, label, notes);
    fieldKinds.push(kind);
    fields.push(fieldFor(name, label, kind));
  });

  let titleIndex = fieldKinds.findIndex((kind) => TITLE_KINDS.has(kind));
  if (titleIndex < 0) {
    const name = fieldName('Name', fields.length, usedNames);
    fields.unshift({ name, label: 'Name', kind: 'text', maxLength: 200 });
    fieldKinds.unshift('text');
    titleIndex = 0;
    notes.push('Added a blank Name field because no imported column was title-compatible.');
  }

  const name = entityName(options.entityName);
  const entity = parseBlueprint({
    formatVersion: 1,
    name: humanLabel(options.entityLabel, name.replace(/-/g, ' ')),
    entities: [
      {
        name,
        plural: `${name}s`,
        label: humanLabel(options.entityLabel, name.replace(/-/g, ' ')),
        fields,
        titleField: (fields[titleIndex] as { name: string }).name,
        searchable: fields
          .filter(
            (_field, index) =>
              index !== titleIndex && SEARCHABLE_KINDS.has(fieldKinds[index] as SampleKind)
          )
          .slice(0, 3)
          .map((field) => (field as { name: string }).name),
        features: { csv: true },
      },
    ],
    roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
  }).entities[0];

  if (!entity) throw new CsvShapeError('invalid-options', 'CSV shape inference produced no entity');
  return {
    entity,
    notes,
    rowsInspected: sampledRows.length,
    columns: headers.length,
  };
}

/** Alias emphasizing the shape-only authoring operation. */
export const inferCsvShape = inferCsvEntity;
