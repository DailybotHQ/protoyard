/** `@protoyard/crud/screens/sheet`: lazy blueprint sheet route (records as a spreadsheet). */

export {
  buildSheetModel,
  type CellPatch,
  cellInput,
  cellPatch,
  type SheetCellInput,
  type SheetColumn,
  type SheetEdit,
  type SheetScreenModel,
  type SheetScreenSpec,
  sheetEdits,
  sheetLayout,
} from './model.ts';
export { default as SheetScreen } from './SheetScreen.svelte';
