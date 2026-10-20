import {
  CSV_SHAPE_MAX_CELL_BYTES,
  CSV_SHAPE_MAX_COLUMNS,
  CSV_SHAPE_MAX_SAMPLE_ROWS,
} from '../csv-guard.ts';

/** Shared hard bounds for data-shape imports. Per-format limits may be lower. */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 10_000;
export const IMPORT_MAX_DEPTH = 8;
export const IMPORT_MAX_COLUMNS = CSV_SHAPE_MAX_COLUMNS;
export const IMPORT_MAX_FIELDS = IMPORT_MAX_COLUMNS;
export const IMPORT_MAX_SAMPLE_RECORDS = CSV_SHAPE_MAX_SAMPLE_ROWS;
export const IMPORT_MAX_STRING_BYTES = CSV_SHAPE_MAX_CELL_BYTES;
export const IMPORT_MAX_JSON_OBJECTS = 2_000;
export const IMPORT_MAX_JSON_NODES = 20_000;

export const IMPORT_SQLITE_MAX_BYTES = 256 * 1024;
export const IMPORT_SQLITE_MAX_TABLES = 50;
export const IMPORT_SQLITE_MAX_TOKENS = 40_000;
