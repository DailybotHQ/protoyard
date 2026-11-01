/** `@protoyard/crud/screens/sheet`: lazy blueprint sheet route (records as a spreadsheet). */

export {
  buildSheetModel,
  type CellPatch,
  cellInput,
  cellPatch,
  type SheetCellInput,
  type SheetColumn,
  type SheetEdit,
  type SheetPatch,
  type SheetScreenModel,
  type SheetScreenSpec,
  sheetEdits,
  sheetLayout,
  sheetPatch,
} from './model.ts';
export { default as SheetScreen } from './SheetScreen.svelte';
