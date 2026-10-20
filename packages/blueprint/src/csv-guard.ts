/**
 * Spreadsheet formula guard shared by every CSV exporter (blueprint entity
 * export, crud analytics export). Kept dependency-free and tiny so the main
 * `@protoyard/blueprint` entry can re-export it without pulling in the codec.
 */

/**
 * Leading characters that make Excel, LibreOffice or Sheets read a cell as a
 * formula: `= + - @` (also after leading whitespace, and their full-width
 * forms), or a leading tab or carriage return.
 */
const FORMULA_TRIGGER = /^(?:[\t\r]|\s*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])/;

/** A whole-cell plain number (`-5`, `+1.25`, `.5`, `1e3`): inert in every spreadsheet. */
const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

/** Limits used by the opt-in CSV shape authoring importer. */
export const CSV_SHAPE_MAX_COLUMNS = 100;
export const CSV_SHAPE_MAX_SAMPLE_ROWS = 100;
export const CSV_SHAPE_MAX_CELL_BYTES = 16 * 1024;

/** True when `text` would be evaluated as a formula and is not a plain number. */
export function needsCsvFormulaGuard(text: string): boolean {
  return FORMULA_TRIGGER.test(text) && !PLAIN_NUMBER.test(text);
}

/** Prefix formula-like text with `'` so spreadsheets show it as text. */
export function guardCsvFormula(text: string): string {
  return needsCsvFormulaGuard(text) ? `'${text}` : text;
}

/** Inverse of {@link guardCsvFormula}: strips the `'` only when export would have added it. */
export function unguardCsvFormula(text: string): string {
  return text.startsWith("'") && needsCsvFormulaGuard(text.slice(1)) ? text.slice(1) : text;
}
