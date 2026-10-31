import {
  type Blueprint,
  createEntityServices,
  deriveIntegrity,
  derivePolicy,
  deriveStores,
  parseBlueprint,
} from '@protoyard/blueprint';
import { createBlueprintGenerator } from '@protoyard/blueprint/generator';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBlueprintDefinition } from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  buildSheetModel,
  cellInput,
  cellPatch,
  SheetScreen,
  type SheetScreenSpec,
  sheetEdits,
} from '../src/screens/sheet/index.ts';

const blueprint: Blueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Studio expenses',
  entities: [
    {
      name: 'expense',
      plural: 'expenses',
      fields: [
        { name: 'title', kind: 'text', required: true },
        { name: 'amount', kind: 'money', min: 0 },
        { name: 'hours', kind: 'integer', min: 0 },
        { name: 'paid', kind: 'boolean' },
        { name: 'spentOn', kind: 'date' },
        { name: 'category', kind: 'enum', values: ['travel', 'tools'] },
      ],
      titleField: 'title',
      seedCount: 1,
    },
  ],
  roles: [
    { name: 'owner', permissions: { '*': ['*'] } },
    { name: 'viewer', permissions: { '*': ['read'] } },
  ],
});
const entity = blueprint.entities[0]!;
const spec = {
  type: 'sheet',
  entity: 'expense',
  columns: ['title', 'amount', 'hours', 'paid', 'spentOn', 'category'],
  totals: ['amount', 'hours'],
} as SheetScreenSpec;

function definition(namespace: string) {
  const base = createBlueprintDefinition(namespace);
  const generator = createBlueprintGenerator(blueprint);
  return {
    ...base,
    database: { versions: [{ version: 1, stores: deriveStores(blueprint) }] },
    policy: derivePolicy(blueprint),
    integrity: deriveIntegrity(blueprint),
    generate: generator.generate,
  };
}

let sequence = 0;
let harness = createHarness(definition('crud-sheet'));
beforeEach(() => {
  sequence += 1;
  harness = createHarness(definition(`crud-sheet-${sequence}`));
});
afterEach(() => {
  cleanup();
  harness.closeAll();
});

/** Boots a role with no records (the generator seeds one). */
async function bootEmpty(role: string) {
  const runtime = await harness.boot(role);
  const services = createEntityServices(runtime, blueprint);
  if (role === 'owner') {
    for (const row of await services.expense!.list())
      await services.expense!.remove(String(row.id));
  }
  return { runtime, services };
}

const field = (name: string) => entity.fields.find((f) => f.name === name)!;
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
const cellText = (row: number, column: number) =>
  document.querySelector(`[data-tx-grid-cell="${row}:${column}"]`)?.textContent?.trim();

async function edit(row: number, column: number, text: string) {
  const target = document.querySelector<HTMLElement>(`[data-tx-grid-cell="${row}:${column}"]`)!;
  target.focus();
  await tick();
  await fireEvent.keyDown(target, { key: 'Enter' });
  const input = await waitFor(() => {
    const found = document.querySelector<HTMLInputElement>('input[data-tx-grid-editor]');
    if (!found) throw new Error('the cell editor did not open');
    return found;
  });
  await fireEvent.input(input, { target: { value: text } });
  await fireEvent.keyDown(input, { key: 'Enter' });
  await tick();
}

describe('sheet screen model', () => {
  const rows = [
    { id: 'e1', title: 'Train', amount: 1250, hours: 2, paid: true, spentOn: '2026-10-01' },
    { id: 'e2', title: '=HYPERLINK("https://example.com")', amount: 399, hours: 1 },
  ];

  it('paints records as cells: money in units, untrusted text kept literal, sums in a totals row', () => {
    const model = buildSheetModel(entity, spec, rows, 'Expenses');
    const cells = model.document.sheets[0].cells;
    expect(cells.A1).toBe('Title');
    expect(cells.B2).toBe(12.5);
    expect(cells.D2).toBe(true);
    expect(cells.E2).toBe('2026-10-01');
    // A record value that looks like a formula never evaluates.
    expect(cells.A3).toBe(`'=HYPERLINK("https://example.com")`);
    expect(cells.A4).toBe('Total');
    expect(cells.B4).toBe('=SUM(B2:B3)');
    expect(cells.C4).toBe('=SUM(C2:C3)');
    expect(model.rowIds).toEqual(['e1', 'e2']);
    expect(cellInput(field('title'), "'quoted")).toBe("''quoted");
  });

  it('turns an edited cell into a field value, refusing formulas and wrong types', () => {
    expect(cellPatch(field('amount'), 19.99)).toEqual({ ok: true, value: 1999 });
    expect(cellPatch(field('hours'), 2.5)).toMatchObject({ ok: false });
    expect(cellPatch(field('title'), '=1+1')).toEqual({
      ok: false,
      message: 'Title keeps a value, not a formula.',
    });
    expect(cellPatch(field('title'), "'=1+1")).toEqual({ ok: true, value: '=1+1' });
    expect(cellPatch(field('category'), 'food')).toMatchObject({ ok: false });
    expect(cellPatch(field('category'), 'tools')).toEqual({ ok: true, value: 'tools' });
    expect(cellPatch(field('spentOn'), 'next week')).toMatchObject({ ok: false });
    expect(cellPatch(field('paid'), false)).toEqual({ ok: true, value: false });
    expect(cellPatch(field('amount'), undefined)).toEqual({ ok: true, value: null });
  });

  it('counts only record cells as edits, never headers or totals', () => {
    const model = buildSheetModel(entity, spec, rows, 'Expenses');
    const cells = { ...model.document.sheets[0].cells, A1: 'Renamed', B4: 7, B2: 13 };
    expect(sheetEdits(model, { sheets: [{ id: 'records', cells }] })).toEqual([
      { id: 'e1', field: field('amount'), input: 13 },
    ]);
  });
});

describe('SheetScreen', () => {
  it('shows records with computed totals and saves an edited cell through the service', async () => {
    const { runtime, services } = await bootEmpty('owner');
    await services.expense!.create({ title: 'Train', amount: 1250, hours: 2 });
    await services.expense!.create({ title: 'Laptop stand', amount: 3999, hours: 1 });
    render(SheetScreen, { runtime, blueprint, services, screen: spec });
    expect(await screen.findByRole('heading', { name: 'Expenses sheet' })).toBeTruthy();
    await waitFor(() => expect(cellText(4, 2)).toBe('52.49'));
    expect(cellText(4, 3)).toBe('3');

    const row = [2, 3].find((r) => cellText(r, 1) === 'Train') as number;
    await edit(row, 2, '20');
    await waitFor(async () => {
      const train = (await services.expense!.list()).find((r) => r.title === 'Train');
      expect(train?.amount).toBe(2000);
    });
    await waitFor(() => expect(cellText(4, 2)).toBe('59.99'));
  });

  it('refuses a formula typed into a record and says why; a stored formula-looking title stays text', async () => {
    const { runtime, services } = await bootEmpty('owner');
    await services.expense!.create({ title: '=1+1', amount: 100 });
    render(SheetScreen, { runtime, blueprint, services, screen: spec });
    await waitFor(() => expect(cellText(2, 1)).toBe('=1+1'));
    await edit(2, 2, '=5*2');
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Amount keeps a value, not a formula.')
    );
    const [stored] = await services.expense!.list();
    expect(stored?.amount).toBe(100);
    await waitFor(() => expect(cellText(2, 2)).toBe('1'));
  });

  it('is read-only for a role that cannot update the entity', async () => {
    const { runtime, services } = await bootEmpty('viewer');
    render(SheetScreen, { runtime, blueprint, services, screen: spec });
    expect(await screen.findByText(/can read these records but not edit them/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Import CSV' })).toBeNull();
    await waitFor(() =>
      expect(
        document.querySelector('[data-tx-grid-cell="1:1"]')?.getAttribute('aria-readonly')
      ).toBe('true')
    );
  });
});
