// @vitest-environment node
import { createRng } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  applyView,
  compileFilter,
  createAxis,
  defaultColumnState,
  exceedsFilterLimits,
  FILTER_LIMITS,
  type FilterNode,
  FilterNodeSchema,
  flattenGroups,
  type GridColumnDef,
  groupRows,
  moveColumn,
  pinColumn,
  resizeColumn,
  resolveColumns,
  type SavedView,
  SavedViewSchema,
  sanitizeView,
  setColumnHidden,
  sortRows,
  windowAxis,
  windowGrid,
} from '../src/grid/index.ts';

interface Deal {
  id: string;
  name: string;
  stage: string;
  amountCents: number | null;
  closesOn: string | null;
  won: boolean;
}

const COLUMNS: GridColumnDef<Deal>[] = [
  { key: 'name', header: 'Name', type: 'text', width: 240 },
  { key: 'stage', header: 'Stage', type: 'enum', options: ['lead', 'proposal', 'won', 'lost'] },
  {
    key: 'amount',
    header: 'Amount',
    type: 'number',
    accessor: (d) => d.amountCents,
    minWidth: 80,
    maxWidth: 300,
  },
  { key: 'closesOn', header: 'Closes on', type: 'date' },
  { key: 'won', header: 'Won', type: 'boolean' },
];

const DEALS: Deal[] = [
  {
    id: 'd1',
    name: 'Northwind renewal',
    stage: 'proposal',
    amountCents: 120_000,
    closesOn: '2026-11-01',
    won: false,
  },
  {
    id: 'd2',
    name: 'acme expansion',
    stage: 'won',
    amountCents: 450_000,
    closesOn: '2026-10-05',
    won: true,
  },
  { id: 'd3', name: 'Globex pilot', stage: 'lead', amountCents: null, closesOn: null, won: false },
  {
    id: 'd4',
    name: 'Initech seats',
    stage: 'proposal',
    amountCents: 80_000,
    closesOn: '2026-12-15',
    won: false,
  },
  {
    id: 'd5',
    name: 'Acme add-on',
    stage: 'won',
    amountCents: 60_000,
    closesOn: '2026-10-20',
    won: true,
  },
];

const ids = (rows: readonly Deal[]) => rows.map((row) => row.id);

describe('virtualization', () => {
  it('computes offsets with sparse measured sizes', () => {
    const axis = createAxis({
      count: 100_000,
      size: 36,
      sizes: new Map([
        [2, 72],
        [10, 20],
      ]),
    });
    expect(axis.total).toBe(100_000 * 36 + 36 - 16);
    expect(axis.offsetOf(2)).toBe(72);
    expect(axis.offsetOf(3)).toBe(144);
    expect(axis.offsetOf(11)).toBe(11 * 36 + 36 - 16);
    expect(axis.indexAt(143)).toBe(2);
    expect(axis.indexAt(144)).toBe(3);
    expect(axis.indexAt(-5)).toBe(0);
    expect(axis.indexAt(1e12)).toBe(99_999);
  });

  it('windows 100,000 rows to the viewport plus overscan', () => {
    const rows = createAxis({ count: 100_000, size: 36 });
    const window = windowAxis(rows, 36 * 50_000, 720, 3);
    expect(window.start).toBe(49_997);
    expect(window.end).toBe(50_023);
    expect(window.items).toHaveLength(26);
    expect(window.items[3]).toEqual({ index: 50_000, start: 1_800_000, size: 36 });
    expect(windowAxis(rows, 0, 0).items).toEqual([]);
    expect(windowAxis(createAxis({ count: 0, size: 36 }), 0, 500).items).toEqual([]);
  });

  it('windows columns between pinned ones', () => {
    const grid = windowGrid({
      rows: createAxis({ count: 1000, size: 40 }),
      columns: createAxis({ count: 50, size: 150 }),
      scrollTop: 400,
      scrollLeft: 1500,
      viewportHeight: 400,
      viewportWidth: 1000,
      pinnedLeftWidth: 200,
      pinnedRightWidth: 100,
    });
    expect(grid.centerWidth).toBe(700);
    expect(grid.columns.start).toBe(9);
    expect(grid.columns.end).toBe(16);
    expect(grid.rows.start).toBe(7);
    expect(grid.totalWidth).toBe(200 + 50 * 150 + 100);
    expect(grid.totalHeight).toBe(40_000);
  });
});

describe('column state', () => {
  it('orders, pins, hides and resizes columns, as plain data', () => {
    let state = defaultColumnState(COLUMNS);
    state = moveColumn(state, 'won', 0);
    state = pinColumn(state, 'name', 'left');
    state = setColumnHidden(state, 'closesOn', true);
    state = resizeColumn(state, COLUMNS, 'amount', 999);
    const resolved = resolveColumns(COLUMNS, state);
    expect(resolved.left.map((c) => c.def.key)).toEqual(['name']);
    expect(resolved.center.map((c) => [c.def.key, c.width])).toEqual([
      ['won', 160],
      ['stage', 160],
      ['amount', 300],
    ]);
    expect(resolved.hidden.map((c) => c.key)).toEqual(['closesOn']);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    const unpinned = resolveColumns(
      COLUMNS,
      pinColumn(setColumnHidden(state, 'closesOn', false), 'name', null)
    );
    expect(unpinned.left).toEqual([]);
    expect(unpinned.center.map((c) => c.def.key)).toEqual([
      'won',
      'name',
      'stage',
      'amount',
      'closesOn',
    ]);
  });

  it('adds new columns at the end and ignores stale entries', () => {
    const resolved = resolveColumns(COLUMNS, [{ key: 'gone', width: 90 }, { key: 'stage' }]);
    expect(resolved.center.map((c) => c.def.key)).toEqual([
      'stage',
      'name',
      'amount',
      'closesOn',
      'won',
    ]);
  });
});

describe('sorting', () => {
  it('sorts by several keys, keeps empty values last and is stable', () => {
    const byStage = sortRows(
      DEALS,
      [
        { key: 'stage', direction: 'asc' },
        { key: 'amount', direction: 'desc' },
      ],
      COLUMNS
    );
    expect(ids(byStage)).toEqual(['d3', 'd1', 'd4', 'd2', 'd5']);
    const byAmountAsc = sortRows(DEALS, [{ key: 'amount', direction: 'asc' }], COLUMNS);
    const byAmountDesc = sortRows(DEALS, [{ key: 'amount', direction: 'desc' }], COLUMNS);
    expect(ids(byAmountAsc).at(-1)).toBe('d3');
    expect(ids(byAmountDesc).at(-1)).toBe('d3');
    expect(ids(sortRows(DEALS, [{ key: 'closesOn', direction: 'asc' }], COLUMNS))).toEqual([
      'd2',
      'd5',
      'd1',
      'd4',
      'd3',
    ]);
  });

  it('sorts text with a fixed locale, ignoring case', () => {
    const byName = sortRows(DEALS, [{ key: 'name', direction: 'asc' }], COLUMNS);
    expect(ids(byName)).toEqual(['d5', 'd2', 'd3', 'd4', 'd1']);
    expect(sortRows(DEALS, [{ key: 'unknown', direction: 'asc' }], COLUMNS)).toEqual(DEALS);
  });
});

describe('filters', () => {
  const run = (ast: FilterNode) => ids(DEALS.filter(compileFilter(ast, COLUMNS)));

  it('applies every operator', () => {
    expect(run({ type: 'condition', field: 'stage', operator: 'eq', value: 'won' })).toEqual([
      'd2',
      'd5',
    ]);
    expect(run({ type: 'condition', field: 'stage', operator: 'neq', value: 'won' })).toEqual([
      'd1',
      'd3',
      'd4',
    ]);
    expect(run({ type: 'condition', field: 'name', operator: 'contains', value: 'ACME' })).toEqual([
      'd2',
      'd5',
    ]);
    expect(
      run({ type: 'condition', field: 'name', operator: 'eq', value: 'globex PILOT' })
    ).toEqual(['d3']);
    expect(
      run({ type: 'condition', field: 'stage', operator: 'in', value: ['lead', 'lost'] })
    ).toEqual(['d3']);
    expect(
      run({ type: 'condition', field: 'amount', operator: 'between', value: [60_000, 120_000] })
    ).toEqual(['d1', 'd4', 'd5']);
    expect(
      run({ type: 'condition', field: 'closesOn', operator: 'before', value: '2026-10-21' })
    ).toEqual(['d2', 'd5']);
    expect(
      run({ type: 'condition', field: 'closesOn', operator: 'after', value: '2026-11-01' })
    ).toEqual(['d4']);
    expect(run({ type: 'condition', field: 'amount', operator: 'isEmpty' })).toEqual(['d3']);
    expect(run({ type: 'condition', field: 'closesOn', operator: 'isNotEmpty' })).toEqual([
      'd1',
      'd2',
      'd4',
      'd5',
    ]);
    expect(run({ type: 'condition', field: 'won', operator: 'eq', value: true })).toEqual([
      'd2',
      'd5',
    ]);
  });

  it('combines and/or groups, and an empty group matches everything', () => {
    const ast: FilterNode = {
      type: 'group',
      op: 'or',
      children: [
        { type: 'condition', field: 'stage', operator: 'eq', value: 'lead' },
        {
          type: 'group',
          op: 'and',
          children: [
            { type: 'condition', field: 'stage', operator: 'eq', value: 'won' },
            { type: 'condition', field: 'amount', operator: 'between', value: [100_000, 500_000] },
          ],
        },
      ],
    };
    expect(run(ast)).toEqual(['d2', 'd3']);
    expect(run({ type: 'group', op: 'and', children: [] })).toHaveLength(5);
  });

  it('rejects unknown fields, unfit operators, bad values and oversized trees as zod errors', () => {
    const fails = (ast: unknown) => {
      try {
        compileFilter(ast, COLUMNS);
        return null;
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        return (error as ZodError).issues[0]?.message;
      }
    };
    expect(fails({ type: 'condition', field: 'owner', operator: 'eq', value: 'x' })).toBe(
      'unknown field "owner"'
    );
    expect(fails({ type: 'condition', field: 'amount', operator: 'contains', value: '1' })).toBe(
      'contains does not apply to Amount (number)'
    );
    expect(fails({ type: 'condition', field: 'amount', operator: 'eq', value: 'ten' })).toBe(
      'Amount compares numbers'
    );
    expect(fails({ type: 'condition', field: 'stage', operator: 'eq', value: 'closed' })).toBe(
      'closed is not an option of Stage'
    );
    expect(
      fails({ type: 'condition', field: 'stage', operator: 'regex', value: '.*' })
    ).toBeTruthy();
    expect(fails({ type: 'condition', field: 'amount', operator: 'between', value: [1] })).toBe(
      'between needs [low, high]'
    );
    expect(fails({ type: 'condition', field: 'amount', operator: 'isEmpty', value: 3 })).toBe(
      'isEmpty takes no value'
    );
    let deep: FilterNode = { type: 'condition', field: 'won', operator: 'isEmpty' };
    for (let i = 0; i < FILTER_LIMITS.depth; i++)
      deep = { type: 'group', op: 'and', children: [deep] };
    expect(fails(deep)).toContain('limited to');
    expect(
      fails({ type: 'condition', field: 'name', operator: 'eq', value: 'x', extra: 'y' })
    ).toBeTruthy();
  });
});

describe('grouping', () => {
  it('groups by one column with count, sum, min and max, empty group last', () => {
    const groups = groupRows(DEALS, {
      by: 'stage',
      columns: COLUMNS,
      aggregates: [
        { key: 'id', fn: 'count' },
        { key: 'amount', fn: 'sum' },
        { key: 'amount', fn: 'min' },
        { key: 'closesOn', fn: 'max' },
      ],
    });
    expect(groups.map((g) => [g.id, ids(g.rows)])).toEqual([
      ['lead', ['d3']],
      ['proposal', ['d1', 'd4']],
      ['won', ['d2', 'd5']],
    ]);
    expect(groups[1]?.aggregates).toEqual({
      'count:id': 2,
      'sum:amount': 200_000,
      'min:amount': 80_000,
      'max:closesOn': Date.parse('2026-12-15'),
    });
    expect(groups[0]?.aggregates).toMatchObject({ 'sum:amount': 0, 'min:amount': null });
    const byDate = groupRows(DEALS, { by: 'closesOn', columns: COLUMNS });
    expect(byDate.at(-1)).toMatchObject({ id: '∅', value: null });
    expect(() => groupRows(DEALS, { by: 'nope', columns: COLUMNS })).toThrow(RangeError);
  });

  it('flattens groups for the virtualizer, honoring collapsed ids', () => {
    const groups = groupRows(DEALS, { by: 'stage', columns: COLUMNS });
    const display = flattenGroups(groups, new Set(['proposal']));
    expect(
      display.map((d) =>
        d.kind === 'group' ? `#${d.group.id}${d.collapsed ? '-' : ''}` : d.row.id
      )
    ).toEqual(['#lead', 'd3', '#proposal-', '#won', 'd2', 'd5']);
  });
});

describe('saved views', () => {
  const view: SavedView = {
    id: 'v1',
    name: 'Open pipeline',
    columns: [
      { key: 'name', pinned: 'left' },
      { key: 'amount', width: 120 },
    ],
    sort: [{ key: 'amount', direction: 'desc' }],
    groupBy: 'stage',
    filter: { type: 'condition', field: 'stage', operator: 'neq', value: 'lost' },
    density: 'compact',
  };

  it('validates strictly and round-trips through JSON', () => {
    expect(SavedViewSchema.parse(JSON.parse(JSON.stringify(view)))).toEqual(view);
    expect(SavedViewSchema.safeParse({ ...view, name: '' }).success).toBe(false);
    expect(SavedViewSchema.safeParse({ ...view, density: 'tiny' }).success).toBe(false);
    expect(SavedViewSchema.safeParse({ ...view, script: 'alert(1)' }).success).toBe(false);
  });

  it('applies filter, sort and grouping', () => {
    const result = applyView(DEALS, view, COLUMNS);
    expect(ids(result.rows)).toEqual(['d2', 'd1', 'd4', 'd5', 'd3']);
    expect(result.groups?.map((g) => g.id)).toEqual(['lead', 'proposal', 'won']);
  });

  it('sanitizes a stored view against the current columns', () => {
    const stored = {
      ...view,
      columns: [{ key: 'name' }, { key: 'region' }],
      sort: [
        { key: 'region', direction: 'asc' },
        { key: 'amount', direction: 'desc' },
      ],
      groupBy: 'region',
      filter: {
        type: 'group',
        op: 'and',
        children: [
          { type: 'condition', field: 'region', operator: 'eq', value: 'emea' },
          { type: 'condition', field: 'won', operator: 'eq', value: true },
        ],
      },
    };
    const { view: clean, dropped } = sanitizeView(stored, COLUMNS);
    expect(clean.columns).toEqual([{ key: 'name' }]);
    expect(clean.sort).toEqual([{ key: 'amount', direction: 'desc' }]);
    expect(clean.groupBy).toBeNull();
    expect(clean.filter).toEqual({
      type: 'group',
      op: 'and',
      children: [{ type: 'condition', field: 'won', operator: 'eq', value: true }],
    });
    expect(dropped).toEqual([
      'filter on region',
      'column region',
      'sort on region',
      'grouping by region',
    ]);
    expect(() => sanitizeView({ nope: true }, COLUMNS)).toThrow(ZodError);
  });

  it('refuses a filter nested thousands of levels deep without overflowing the stack', () => {
    let deep: unknown = { type: 'condition', field: 'won', operator: 'isEmpty' };
    for (let i = 0; i < 5000; i++) deep = { type: 'group', op: 'and', children: [deep] };
    expect(exceedsFilterLimits(deep)).toBe(true);
    const parsed = FilterNodeSchema.safeParse(deep);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain('limited to');
    expect(SavedViewSchema.safeParse({ ...view, filter: deep }).success).toBe(false);
    // The documented ZodError, never a RangeError.
    expect(() => sanitizeView({ ...view, filter: deep }, COLUMNS)).toThrow(ZodError);

    const wide = {
      type: 'group',
      op: 'or',
      children: Array.from({ length: FILTER_LIMITS.nodes }, () => ({
        type: 'condition',
        field: 'won',
        operator: 'isEmpty',
      })),
    };
    expect(exceedsFilterLimits(wide)).toBe(true);
    expect(FilterNodeSchema.safeParse(wide).success).toBe(false);
    expect(exceedsFilterLimits(view.filter)).toBe(false);
    expect(FilterNodeSchema.safeParse(view.filter).success).toBe(true);
  });
});

describe('100,000 rows', () => {
  // The task's budget is 150 ms per operation (times PROTOYARD_PERF_FACTOR on CI).
  // A shared machine can run 3–10× slower, so the budget also scales with a
  // calibration measured in the same process: a native sort of 100,000 numbers.
  const factor = Number(process.env.PROTOYARD_PERF_FACTOR ?? 1);
  const rng = createRng('grid-100k');
  const stages = ['lead', 'proposal', 'won', 'lost'];
  const rows: Deal[] = Array.from({ length: 100_000 }, (_, i) => ({
    id: `d${i}`,
    name: `Deal ${rng.int(0, 99_999)}`,
    stage: stages[rng.int(0, 3)] as string,
    amountCents: rng.chance(0.05) ? null : rng.int(1000, 10_000_000),
    closesOn: `2026-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`,
    won: rng.chance(0.3),
  }));
  // Best of three after a warm-up run: a regression guard on a shared machine,
  // not a benchmark (machine load and JIT warm-up dominate a single run).
  const time = (work: () => unknown) => {
    work();
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 3; i++) {
      const started = performance.now();
      work();
      best = Math.min(best, performance.now() - started);
    }
    return best;
  };

  it('sorts, filters and groups within budget', { timeout: 30_000 }, () => {
    const random = createRng('calibration');
    const baselineMs = time(() =>
      Float64Array.from({ length: 100_000 }, () => random.next()).sort()
    );
    const budget = Math.max(150 * factor, 30 * baselineMs);
    const sortMs = time(() =>
      sortRows(
        rows,
        [
          { key: 'stage', direction: 'asc' },
          { key: 'amount', direction: 'desc' },
        ],
        COLUMNS
      )
    );
    const textSortMs = time(() => sortRows(rows, [{ key: 'name', direction: 'asc' }], COLUMNS));
    const filter = compileFilter(
      {
        type: 'group',
        op: 'and',
        children: [
          { type: 'condition', field: 'stage', operator: 'in', value: ['proposal', 'won'] },
          { type: 'condition', field: 'amount', operator: 'between', value: [50_000, 5_000_000] },
        ],
      },
      COLUMNS
    );
    const filterMs = time(() => rows.filter(filter));
    const groupMs = time(() =>
      groupRows(rows, { by: 'stage', columns: COLUMNS, aggregates: [{ key: 'amount', fn: 'sum' }] })
    );
    console.info(
      `grid 100k: sort ${sortMs.toFixed(1)} ms, text sort ${textSortMs.toFixed(1)} ms, filter ${filterMs.toFixed(1)} ms, group ${groupMs.toFixed(1)} ms (budget ${budget.toFixed(0)} ms, native sort ${baselineMs.toFixed(1)} ms)`
    );
    expect(sortMs).toBeLessThan(budget);
    expect(textSortMs).toBeLessThan(budget);
    expect(filterMs).toBeLessThan(budget);
    expect(groupMs).toBeLessThan(budget);
  });
});
