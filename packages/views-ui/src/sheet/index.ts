/**
 * `@protoyard/views-ui/sheet` — spreadsheets: a thin host adapter over
 * `@texuli/sheets/view` (bounded formulas, cycle and limit errors, CSV with
 * formula injection neutralized), plus Texuli's framework-free model and CSV
 * helpers. A lazy subpath; never part of the `@protoyard/ui` barrel.
 */

export { csvToSheet, sheetToCsv } from '@texuli/sheets/csv';
export {
  createSheet,
  createWorkbook,
  displayValue,
  SHEET_LIMITS,
  type SheetDocument,
  type SheetTab,
  validateSheet,
} from '@texuli/sheets/model';
export { default as SheetView } from './SheetView.svelte';
