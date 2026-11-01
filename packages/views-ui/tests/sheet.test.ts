import { generateSheetWorkbook, type SheetWorkbookData } from '@protoyard/views/scenarios';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type SheetDocument, SheetView, validateSheet } from '../src/sheet/index.ts';

afterEach(cleanup);

const ctx = (seed = 1, density = 'typical') =>
  ({ scenario: { id: 'sheet-test', seed, density } }) as never;
const NOW = new Date('2026-10-01T12:00:00Z');
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

function mount(current: unknown, props: Record<string, unknown> = {}) {
  const view = render(SheetView, {
    query: { current, loading: false, error: undefined },
    now: NOW,
    ...props,
  });
  const node = (row: number, column: number) =>
    view.container.querySelector<HTMLElement>(`[data-tx-grid-cell="${row}:${column}"]`);
  /** A cell's shown text (computed values; errors as their code). */
  const cell = (row: number, column: number) => {
    const found = node(row, column);
    return found ? { node: found, textContent: found.textContent?.trim() ?? '' } : null;
  };
  return { ...view, cell };
}

/** Types into a cell through Texuli's grid editor: Enter, the text, Enter. */
async function edit(target: HTMLElement, text: string) {
  target.focus();
  await tick();
  await fireEvent.keyDown(target, { key: 'Enter' });
  // The grid loads its cell editor on the first edit: wait for it to open.
  const input = await waitFor(() => {
    const found = document.querySelector<HTMLInputElement>('input[data-tx-grid-editor]');
    if (!found) throw new Error('the cell editor did not open');
    return found;
  });
  await fireEvent.input(input, { target: { value: text } });
  await fireEvent.keyDown(input, { key: 'Enter' });
  await tick();
}

describe('views budget workbook (scenario generator)', () => {
  it('is a valid Texuli sheet at every level', () => {
    for (const level of ['empty', 'typical', 'dense', 'edge'] as const) {
      const doc = generateSheetWorkbook(ctx(), { level });
      const checked = validateSheet(doc);
      expect(checked.ok, `${level}: ${JSON.stringify(checked.ok ? [] : checked.issues[0])}`).toBe(
        true
      );
    }
    expect(
      Object.keys(generateSheetWorkbook(ctx(), { level: 'dense' }).sheets[0]?.cells ?? {}).length
    ).toBeGreaterThan(2000 * 6);
  });

  it('is deterministic per scenario seed, and follows the scenario density', () => {
    expect(generateSheetWorkbook(ctx(7))).toEqual(generateSheetWorkbook(ctx(7)));
    expect(generateSheetWorkbook(ctx(7))).not.toEqual(generateSheetWorkbook(ctx(8)));
    const empty = generateSheetWorkbook(ctx(1, 'empty'));
    expect(Object.keys(empty.sheets[0]?.cells ?? {})).toEqual([
      'A1',
      'B1',
      'C1',
      'D1',
      'E1',
      'F1',
      'G1',
    ]);
  });
});

describe('SheetView (Texuli sheets host adapter)', () => {
  it('paints computed formulas: row sums, the totals row and each share', async () => {
    const doc = generateSheetWorkbook(ctx());
    const { cell } = mount(doc);
    await tick();
    const row = (n: number) => [2, 3, 4, 5].map((c) => Number(cell(n, c)?.textContent));
    const quarters = row(2);
    expect(Number(cell(2, 6)?.textContent)).toBe(quarters.reduce((a, b) => a + b, 0));
    const lines = Array.from({ length: 12 }, (_, i) => Number(cell(2 + i, 6)?.textContent));
    expect(cell(14, 1)?.textContent).toBe('Total');
    expect(Number(cell(14, 6)?.textContent)).toBe(lines.reduce((a, b) => a + b, 0));
    expect(screen.getByRole('grid', { name: /Spreadsheet/ })).toBeTruthy();
  });

  it('shows error values for awkward data: division by zero, a cycle, and reads across sheets', async () => {
    const doc = generateSheetWorkbook(ctx(), { level: 'edge' });
    const { cell, container } = mount(doc);
    await tick();
    expect(cell(2, 8)?.textContent).toBe('#DIV/0!');
    expect(cell(2, 10)?.textContent).toBe('#CYCLE!');
    // The summary sheet reads the budget's total across sheets.
    const total = cell(8, 6)?.textContent;
    await fireEvent.click(screen.getByRole('button', { name: 'Summary' }));
    await tick();
    expect(container.querySelector('[data-tx-grid-cell="1:2"]')?.textContent?.trim()).toBe(total);
  });

  it('persists an edit through the service, and keeps its undo history when the edit comes back', async () => {
    const doc = generateSheetWorkbook(ctx());
    const calls: SheetDocument[] = [];
    const view = mount(doc, {
      onChange: (sheet: SheetDocument) => {
        calls.push(sheet);
        return true;
      },
    });
    await tick();
    await edit(view.cell(2, 2)?.node as HTMLElement, '1000');
    expect(calls).toHaveLength(1);
    const saved = calls[0] as SheetDocument;
    expect(saved.sheets[0]?.cells?.B2).toBe(1000);
    // The query returns what was stored (a copy): the view keeps its workbook.
    await view.rerender({
      query: { current: structuredClone(saved), loading: false, error: undefined },
    });
    await tick();
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(false);
  });

  it('puts the stored workbook back when the service refuses the edit', async () => {
    const doc = generateSheetWorkbook(ctx());
    const stored = String(doc.sheets[0]?.cells.B2);
    const view = mount(doc, { onChange: () => false });
    await tick();
    await edit(view.cell(2, 2)?.node as HTMLElement, '1000');
    await waitFor(() => expect(view.cell(2, 2)?.textContent).toBe(stored));
  });

  it('is read-only without a service: no import, every cell aria-readonly', async () => {
    const { container } = mount(generateSheetWorkbook(ctx()));
    await tick();
    expect(screen.queryByRole('button', { name: 'Import CSV' })).toBeNull();
    expect(
      container.querySelector('[data-tx-grid-cell="2:2"]')?.getAttribute('aria-readonly')
    ).toBe('true');
  });

  it('refuses a stored workbook that is not a valid sheet (untrusted data)', async () => {
    const bad = {
      ...generateSheetWorkbook(ctx()),
      extra: '<script>',
    } as unknown as SheetWorkbookData;
    const { container } = mount(bad);
    await tick();
    expect(screen.getByRole('alert').textContent).toMatch(/could not be opened/);
    expect(container.querySelector('[data-tx-sheets-view]')).toBeNull();
  });

  it('downloads the active sheet as CSV with computed values', async () => {
    let blob: Blob | undefined;
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
      blob = value as Blob;
      return 'blob:sheet';
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mount(generateSheetWorkbook(ctx()));
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    const text = await (blob as Blob).text();
    expect(text.split(/\r\n/)[0]).toBe('Line,Q1,Q2,Q3,Q4,Year,Share');
    expect(text).toContain('Total,');
    expect(text).not.toContain('=SUM');
    expect(click).toHaveBeenCalledTimes(1);
    create.mockRestore();
    revoke.mockRestore();
    click.mockRestore();
  });

  it('imports a CSV file as a new sheet, with formula fields kept as text', async () => {
    const onChange = vi.fn((_sheet: SheetDocument) => true);
    const { container } = mount(generateSheetWorkbook(ctx()), { onChange });
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(['Item,Cost\nPaper,12\nInjected,=1+1\n'], 'supplies.csv', {
      type: 'text/csv',
    });
    await fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const saved = onChange.mock.calls[0]?.[0] as SheetDocument;
    const imported = saved.sheets.find((sheet) => sheet.name === 'supplies');
    expect(imported?.cells?.B2).toBe(12);
    expect(imported?.cells?.B3).toBe("'=1+1");
  });

  it('puts the shown sheet back when the service refuses an imported sheet', async () => {
    const doc = generateSheetWorkbook(ctx());
    const stored = String(doc.sheets[0]?.cells.B2);
    const onChange = vi.fn((_sheet: SheetDocument) => false);
    const view = mount(doc, { onChange });
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
    const input = view.container.querySelector<HTMLInputElement>(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(['Item,Cost\nPaper,12\n'], 'supplies.csv', { type: 'text/csv' });
    await fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    await tick();
    await waitFor(() => expect(view.cell(2, 2)?.textContent).toBe(stored));
    expect(screen.queryByRole('tab', { name: 'supplies' })).toBeNull();
    // The active sheet is the stored one again: a download exports it, not the refused import.
    let blob: Blob | undefined;
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
      blob = value as Blob;
      return 'blob:sheet';
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect((await (blob as Blob).text()).split(/\r\n/)[0]).toBe('Line,Q1,Q2,Q3,Q4,Year,Share');
    create.mockRestore();
    revoke.mockRestore();
    click.mockRestore();
  });

  it('hides Import CSV with csvImport={false} and keeps Download CSV', async () => {
    mount(generateSheetWorkbook(ctx()), { onChange: () => true, csvImport: false });
    await tick();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Import CSV' })).toBeNull();
  });

  it('reads TODAY() from the host clock, never the system clock', async () => {
    const doc = {
      format: 'texuli-sheet',
      formatVersion: 1,
      sheets: [
        { id: 'clock', name: 'Clock', rows: 2, columns: 1, cells: { A1: '=YEAR(TODAY())' } },
      ],
    };
    const { cell } = mount(doc, { now: new Date('2031-03-04T12:00:00Z') });
    await tick();
    expect(cell(1, 1)?.textContent).toBe('2031');
  });
});
