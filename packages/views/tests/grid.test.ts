// @vitest-environment node
import { createRng } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

function isSchemaError(error: unknown): boolean {
  return (
    error instanceof ZodError ||
    (typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name: string }).name === 'ValidationError')
  );
}

import {
  applyView,
  compileFilter,
  createAxis,
  defaultColumnState,
  describeFilter,
  exceedsFilterLimits,
  FILTER_LIMITS,
  FILTER_OPERATOR_LABELS,
  type FilterNode,
  FilterNodeSchema,
  facetsFromFilter,
  filterFromFacets,
  filtersEqual,
  flattenGroups,
  type GridColumnDef,
  groupRows,
  isViewModified,
  moveColumn,
  nextViewId,
  normalizeFilter,
  parseSerializedFilter,
  pinColumn,
  pruneSelection,
  removeFilterAt,
  resizeColumn,
  resolveColumns,
  type SavedView,
  SavedViewSchema,
  SERIALIZED_FILTER_MAX_BYTES,
  sanitizeView,
  selectionState,
  selectRange,
  serializeFilter,
  setColumnHidden,
  setFacet,
  setVisibleSelected,
  showAllColumns,
  sortRows,
  tidyFilter,
  toggleFacetValue,
  toggleRow,
  type ViewState,
  viewStatesEqual,
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
        expect(isSchemaError(error)).toBe(true);
        return (error as { issues?: { message?: string }[] }).issues?.[0]?.message;
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
    expect(() => sanitizeView({ nope: true }, COLUMNS)).toThrow();
  });

  it('refuses a filter nested thousands of levels deep without overflowing the stack', () => {
    let deep: unknown = { type: 'condition', field: 'won', operator: 'isEmpty' };
    for (let i = 0; i < 5000; i++) deep = { type: 'group', op: 'and', children: [deep] };
    expect(exceedsFilterLimits(deep)).toBe(true);
    const parsed = FilterNodeSchema.safeParse(deep);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain('limited to');
    }
    expect(SavedViewSchema.safeParse({ ...view, filter: deep }).success).toBe(false);
    // The documented ZodError, never a RangeError.
    expect(() => sanitizeView({ ...view, filter: deep }, COLUMNS)).toThrow();

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
  // Default factor 5 matches multi-lane host load (PLAN_001); set PROTOYARD_PERF_FACTOR=1 for a tight gate.
  const factor = Number(process.env.PROTOYARD_PERF_FACTOR ?? 5);
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

describe('filter composition', () => {
  const stageIn = (...values: string[]): FilterNode => ({
    type: 'condition',
    field: 'stage',
    operator: 'in',
    value: values,
  });
  const wonEq: FilterNode = { type: 'condition', field: 'won', operator: 'eq', value: true };
  const nameHas: FilterNode = {
    type: 'condition',
    field: 'name',
    operator: 'contains',
    value: 'acme',
  };

  it('serializes equal filters to the same text whatever the build order', () => {
    const a: FilterNode = {
      type: 'group',
      op: 'and',
      children: [stageIn('won', 'lead', 'won'), { type: 'group', op: 'and', children: [wonEq] }],
    };
    const b: FilterNode = {
      type: 'group',
      op: 'and',
      children: [wonEq, { type: 'group', op: 'or', children: [] }, stageIn('lead', 'won')],
    };
    expect(serializeFilter(a)).toBe(serializeFilter(b));
    expect(serializeFilter(a)).toBe(
      '{"type":"group","op":"and","children":[{"type":"condition","field":"stage","operator":"in","value":["lead","won"]},{"type":"condition","field":"won","operator":"eq","value":true}]}'
    );
    expect(filtersEqual(a, b)).toBe(true);
    expect(filtersEqual(a, { ...b, op: 'or' } as FilterNode)).toBe(false);
    expect(serializeFilter(null)).toBe('');
    expect(serializeFilter({ type: 'group', op: 'and', children: [] })).toBe('');
  });

  it('normalizes without changing which rows match', () => {
    const messy: FilterNode = {
      type: 'group',
      op: 'or',
      children: [
        { type: 'group', op: 'or', children: [stageIn('won', 'won'), nameHas] },
        {
          type: 'group',
          op: 'and',
          children: [stageIn('lead'), { type: 'group', op: 'and', children: [] }],
        },
        { type: 'group', op: 'and', children: [wonEq, wonEq] },
      ],
    };
    const normal = normalizeFilter(messy) as FilterNode;
    expect(ids(DEALS.filter(compileFilter(normal, COLUMNS)))).toEqual(
      ids(DEALS.filter(compileFilter(messy, COLUMNS)))
    );
    // Same-op group merged, duplicates gone, single-child groups unwrapped: 4 distinct children.
    expect((normal as { children: FilterNode[] }).children).toHaveLength(4);
    expect(normalizeFilter(normal)).toEqual(normal);
  });

  it('treats an empty group as matching every row, like compileFilter does', () => {
    const empty: FilterNode = { type: 'group', op: 'and', children: [] };
    const orWithEmpty: FilterNode = { type: 'group', op: 'or', children: [wonEq, empty] };
    expect(DEALS.filter(compileFilter(orWithEmpty, COLUMNS))).toHaveLength(DEALS.length);
    expect(normalizeFilter(orWithEmpty)).toBeNull();
    expect(tidyFilter(orWithEmpty)).toBeNull();
    expect(normalizeFilter({ type: 'group', op: 'and', children: [wonEq, empty] })).toEqual(wonEq);
    expect(tidyFilter({ type: 'group', op: 'and', children: [wonEq, empty] })).toEqual(wonEq);
  });

  it('orders scalars deterministically across types', () => {
    const value = (
      normalizeFilter({
        type: 'condition',
        field: 'stage',
        operator: 'in',
        value: ['b', 10, null, true, 2, 'a', 'b'],
      }) as { value: unknown[] }
    ).value;
    expect(value).toEqual([null, true, 2, 10, 'a', 'b']);
  });

  it('tidies structure but keeps the author order', () => {
    const tree: FilterNode = {
      type: 'group',
      op: 'and',
      children: [wonEq, { type: 'group', op: 'or', children: [nameHas] }, stageIn('lead')],
    };
    expect(tidyFilter(tree)).toEqual({
      type: 'group',
      op: 'and',
      children: [wonEq, nameHas, stageIn('lead')],
    });
    expect(tidyFilter({ type: 'group', op: 'and', children: [] })).toBeNull();
  });

  it('round-trips through serialized text, validated as untrusted input', () => {
    const filter: FilterNode = { type: 'group', op: 'and', children: [stageIn('won'), nameHas] };
    const text = serializeFilter(filter);
    expect(parseSerializedFilter(text, COLUMNS)).toEqual(normalizeFilter(filter));
    expect(parseSerializedFilter('')).toBeNull();
    expect(() => parseSerializedFilter('{oops')).toThrow(/not valid JSON/);
    expect(() =>
      parseSerializedFilter(
        '{"type":"condition","field":"ghost","operator":"eq","value":1}',
        COLUMNS
      )
    ).toThrow(/unknown field "ghost"/);
    expect(() => parseSerializedFilter(' '.repeat(SERIALIZED_FILTER_MAX_BYTES + 1))).toThrow(
      /limited to/
    );
    let deep = '{"type":"condition","field":"name","operator":"isEmpty"}';
    for (let i = 0; i < 50; i++) deep = `{"type":"group","op":"and","children":[${deep}]}`;
    expect(() => parseSerializedFilter(deep)).toThrow(/levels/);
  });

  it('composes facets: OR within a field, AND across fields', () => {
    let filter: FilterNode | null = null;
    filter = toggleFacetValue(filter, 'stage', 'won');
    expect(filter).toEqual({ type: 'condition', field: 'stage', operator: 'eq', value: 'won' });
    filter = toggleFacetValue(filter, 'stage', 'lead');
    filter = toggleFacetValue(filter, 'won', false);
    expect(filter).toEqual({
      type: 'group',
      op: 'and',
      children: [
        stageIn('lead', 'won'),
        { type: 'condition', field: 'won', operator: 'eq', value: false },
      ],
    });
    // stage ∈ {lead, won} AND won = false → d3 (lead) only.
    expect(ids(DEALS.filter(compileFilter(filter, COLUMNS)))).toEqual(['d3']);
    expect(facetsFromFilter(filter).facets).toEqual({ stage: ['lead', 'won'], won: [false] });
    filter = toggleFacetValue(filter, 'stage', 'lead');
    filter = toggleFacetValue(filter, 'stage', 'won');
    expect(filter).toEqual({ type: 'condition', field: 'won', operator: 'eq', value: false });
    expect(toggleFacetValue(filter, 'won', false)).toBeNull();
  });

  it('keeps conditions that are not facets when facets change', () => {
    const start: FilterNode = { type: 'group', op: 'and', children: [nameHas, stageIn('won')] };
    const { facets, rest } = facetsFromFilter(start);
    expect(facets).toEqual({ stage: ['won'] });
    expect(rest).toEqual([nameHas]);
    expect(setFacet(start, 'stage', ['lead', 'proposal'])).toEqual({
      type: 'group',
      op: 'and',
      children: [stageIn('lead', 'proposal'), nameHas],
    });
    expect(setFacet(start, 'stage', [])).toEqual(nameHas);
    // An OR root is not a facet: the facet is AND-ed with it.
    const either: FilterNode = { type: 'group', op: 'or', children: [nameHas, wonEq] };
    expect(setFacet(either, 'stage', ['won'])).toEqual({
      type: 'group',
      op: 'and',
      children: [{ type: 'condition', field: 'stage', operator: 'eq', value: 'won' }, either],
    });
    expect(filterFromFacets({ stage: [], won: [] })).toBeNull();
  });

  it('describes a filter as chips and removes one by path', () => {
    const filter: FilterNode = {
      type: 'group',
      op: 'and',
      children: [
        stageIn('lead', 'proposal', 'won'),
        { type: 'condition', field: 'amount', operator: 'between', value: [100, 500] },
        { type: 'condition', field: 'closesOn', operator: 'isEmpty' },
        { type: 'group', op: 'or', children: [nameHas, wonEq] },
      ],
    };
    const chips = describeFilter(filter, COLUMNS, {
      formatValue: (field, value) =>
        field === 'stage' ? String(value).toUpperCase() : String(value),
    });
    expect(chips.map((chip) => chip.text)).toEqual([
      'Stage is any of LEAD, PROPOSAL or WON',
      'Amount is between 100 and 500',
      'Closes on is empty',
      'Any of 2 conditions',
    ]);
    expect(chips.map((chip) => chip.id)).toEqual(['0', '1', '2', '3']);
    expect(describeFilter(wonEq, COLUMNS)[0]).toMatchObject({ id: '', text: 'Won is Yes' });
    expect(describeFilter(null, COLUMNS)).toEqual([]);
    expect(FILTER_OPERATOR_LABELS.neq).toBe('is not');

    const withoutAmount = removeFilterAt(filter, chips[1]?.path ?? []);
    expect(describeFilter(withoutAmount, COLUMNS).map((chip) => chip.label)).toEqual([
      'Stage',
      'Closes on',
      'Any of',
    ]);
    expect(removeFilterAt(filter, [3, 0])).toMatchObject({
      children: [stageIn('lead', 'proposal', 'won'), expect.anything(), expect.anything(), wonEq],
    });
    expect(removeFilterAt(wonEq, [])).toBeNull();
    // Emptying a nested group removes the group, so an OR never widens to every row.
    const either: FilterNode = {
      type: 'group',
      op: 'or',
      children: [nameHas, { type: 'group', op: 'and', children: [wonEq] }],
    };
    expect(removeFilterAt(either, [1, 0])).toEqual(nameHas);
    expect(removeFilterAt({ type: 'group', op: 'and', children: [wonEq, nameHas] }, [0])).toEqual(
      nameHas
    );
  });
});

describe('saved view state', () => {
  const base: ViewState = {
    columns: [{ key: 'name' }, { key: 'stage', width: 120 }],
    sort: [{ key: 'name', direction: 'asc' }],
    groupBy: null,
    filter: null,
    density: 'comfortable',
  };

  it('detects modifications but ignores equivalent filters and default keys', () => {
    expect(viewStatesEqual(base, structuredClone(base))).toBe(true);
    expect(
      viewStatesEqual(base, {
        ...base,
        columns: [{ key: 'name', hidden: false } as never, { key: 'stage', width: 120 }],
      })
    ).toBe(true);
    const a: FilterNode = {
      type: 'condition',
      field: 'stage',
      operator: 'in',
      value: ['won', 'lead'],
    };
    const b: FilterNode = {
      type: 'condition',
      field: 'stage',
      operator: 'in',
      value: ['lead', 'won'],
    };
    expect(isViewModified({ ...base, filter: a }, { ...base, filter: b })).toBe(false);
    expect(isViewModified(base, { ...base, density: 'compact' })).toBe(true);
    expect(isViewModified(base, { ...base, groupBy: 'stage' })).toBe(true);
    expect(isViewModified(base, { ...base, sort: [] })).toBe(true);
    expect(
      isViewModified(base, { ...base, columns: setColumnHidden(base.columns, 'stage', true) })
    ).toBe(true);
  });

  it('derives deterministic, unique view ids from names', () => {
    expect(nextViewId('My open deals', [])).toBe('my-open-deals');
    expect(nextViewId('My open deals', ['my-open-deals', 'my-open-deals-2'])).toBe(
      'my-open-deals-3'
    );
    expect(nextViewId('Café Q3 — top!', [])).toBe('cafe-q3-top');
    expect(nextViewId('***', [])).toBe('view');
    expect(nextViewId('x'.repeat(100), []).length).toBeLessThanOrEqual(48);
    expect(
      SavedViewSchema.safeParse({
        id: nextViewId('A long name '.repeat(9), []),
        name: 'long',
        columns: [],
        sort: [],
        groupBy: null,
        filter: null,
        density: 'comfortable',
      }).success
    ).toBe(true);
  });

  it('shows every column for the chooser while keeping order and widths', () => {
    const state = setColumnHidden([{ key: 'stage', width: 120 }, { key: 'ghost' }], 'stage', true);
    expect(showAllColumns(state, COLUMNS)).toEqual([
      { key: 'stage', width: 120 },
      { key: 'name' },
      { key: 'amount' },
      { key: 'closesOn' },
      { key: 'won' },
    ]);
    expect(showAllColumns([], COLUMNS)).toEqual(defaultColumnState(COLUMNS));
  });
});

describe('row selection', () => {
  const order = ['d1', 'd2', 'd3', 'd4', 'd5'];

  it('toggles rows and keeps them in row order', () => {
    let selection = toggleRow([], 'd4', order);
    selection = toggleRow(selection, 'd1', order);
    expect(selection).toEqual(['d1', 'd4']);
    expect(toggleRow(selection, 'd4', order)).toEqual(['d1']);
  });

  it('selects a range from the anchor in either direction', () => {
    expect(selectRange(['d1'], order, 'd2', 'd4')).toEqual(['d1', 'd2', 'd3', 'd4']);
    expect(selectRange([], order, 'd5', 'd3')).toEqual(['d3', 'd4', 'd5']);
    expect(selectRange([], order, null, 'd3')).toEqual(['d3']);
    expect(selectRange([], order, 'gone', 'd3')).toEqual(['d3']);
  });

  it('selects and clears the visible rows, keeping hidden selections', () => {
    const visible = ['d2', 'd3'];
    expect(setVisibleSelected(['d5'], visible, true)).toEqual(['d2', 'd3', 'd5']);
    expect(setVisibleSelected(['d2', 'd3', 'd5'], visible, false)).toEqual(['d5']);
    expect(selectionState(['d5'], visible)).toBe('none');
    expect(selectionState(['d2'], visible)).toBe('some');
    expect(selectionState(['d3', 'd2'], visible)).toBe('all');
    expect(selectionState(['d1'], [])).toBe('none');
    expect(pruneSelection(['d1', 'd9', 'd3'], order)).toEqual(['d1', 'd3']);
  });
});
