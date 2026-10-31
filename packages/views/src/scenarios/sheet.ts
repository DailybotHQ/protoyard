import { countFor, type ViewsCtx, type ViewsLevel, viewsLevel, viewsRng } from './shared.ts';

/**
 * A workbook in Texuli's sheet format (`@texuli/sheets/model` `SheetDocument`),
 * as plain data: this package does not import `@texuli/sheets`, and
 * `@protoyard/views-ui/sheet` validates it (`validateSheet`) before it paints.
 */
export interface SheetWorkbookData {
  format: 'texuli-sheet';
  formatVersion: 1;
  meta: { title: string };
  sheets: SheetTabData[];
}

export interface SheetTabData {
  id: string;
  name: string;
  rows: number;
  columns: number;
  /** Inputs by A1 address: a number, a boolean, text, or a formula starting with `=`. */
  cells: Record<string, number | boolean | string>;
}

export interface SheetWorkbookOptions {
  level?: ViewsLevel;
  title?: string;
}

const LINES = [
  'Hosting',
  'Design tools',
  'Contractors',
  'Travel',
  'Office snacks',
  'Training',
  'Hardware',
  'Support desk',
  'Marketing',
  'Insurance',
  'Licenses',
  'Events',
];
/** Q1–Q4 amounts. */
const QUARTER_COLUMNS = ['B', 'C', 'D', 'E'] as const;
/** Columns: A line, B–E quarters, F the yearly total, G the share of all spend. */
const COLUMNS = 7;

/**
 * A fictional yearly budget: one row per spend line with four quarterly
 * amounts (whole currency units), a SUM per row, a totals row and each line's
 * share of the total. Levels: `empty` (headers only), `typical` (12 lines),
 * `dense` (2,000 lines, past the view's windowing threshold) and `edge` (a
 * second sheet read across sheets, a division by zero, a cycle and a long
 * label, so error values and `#CYCLE!` show).
 */
export function generateSheetWorkbook(
  ctx: ViewsCtx,
  options: SheetWorkbookOptions = {}
): SheetWorkbookData {
  const level = viewsLevel(ctx, 'sheet', options.level);
  const lines = countFor(level, [0, 12, 2000, 6]);
  const rng = viewsRng(ctx, 'sheet');
  const cells: SheetTabData['cells'] = {
    A1: 'Line',
    B1: 'Q1',
    C1: 'Q2',
    D1: 'Q3',
    E1: 'Q4',
    F1: 'Year',
    G1: 'Share',
  };
  const first = 2;
  const last = first + lines - 1;
  const totalRow = last + 1;
  for (let i = 0; i < lines; i++) {
    const row = first + i;
    const base = LINES[i % LINES.length] as string;
    cells[`A${row}`] = i < LINES.length ? base : `${base} ${Math.floor(i / LINES.length) + 1}`;
    for (const column of QUARTER_COLUMNS) cells[`${column}${row}`] = rng.int(2, 60) * 50;
    cells[`F${row}`] = `=SUM(B${row}:E${row})`;
    cells[`G${row}`] = `=ROUND(F${row}/F$${totalRow}*100,1)`;
  }
  if (lines > 0) {
    cells[`A${totalRow}`] = 'Total';
    for (const column of 'BCDEF')
      cells[`${column}${totalRow}`] = `=SUM(${column}${first}:${column}${last})`;
  }

  const budget: SheetTabData = {
    id: 'budget',
    name: 'Budget',
    rows: Math.max(20, totalRow + 5),
    columns: COLUMNS,
    cells,
  };
  const sheets = [budget];

  if (level === 'edge') {
    // Awkward on purpose: a label longer than a column, an empty denominator,
    // a cycle, and a summary sheet that reads the budget across sheets.
    cells.A2 = 'Hosting, including the long-running staging cluster we keep meaning to retire';
    cells.H1 = 'Per head';
    cells.H2 = '=F2/I2';
    cells.I1 = 'Heads';
    cells.J1 = 'Loop';
    cells.J2 = '=J3+1';
    cells.J3 = '=J2+1';
    budget.columns = 10;
    sheets.push({
      id: 'summary',
      name: 'Summary',
      rows: 6,
      columns: 2,
      cells: {
        A1: 'Yearly spend',
        B1: `=Budget!F${totalRow}`,
        A2: 'Largest quarter',
        B2: `=MAX(Budget!B${totalRow}:E${totalRow})`,
        A3: 'Planned',
        B3: true,
      },
    });
  }

  return {
    format: 'texuli-sheet',
    formatVersion: 1,
    meta: { title: options.title ?? 'Yearly budget' },
    sheets,
  };
}
