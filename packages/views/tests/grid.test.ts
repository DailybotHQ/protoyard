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
  compileFilter,
  exceedsFilterLimits,
  FILTER_LIMITS,
  type FilterNode,
  FilterNodeSchema,
  type GridColumnDef,
  normalizeFilter,
  parseSerializedFilter,
  type SavedView,
  SavedViewSchema,
  SERIALIZED_FILTER_MAX_BYTES,
  sanitizeView,
  serializeFilter,
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

describe('filters', () => {
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

describe('filter composition', () => {
  const stageIn = (...values: string[]): FilterNode => ({
    type: 'condition',
    field: 'stage',
    operator: 'in',
    value: values,
  });
  const nameHas: FilterNode = {
    type: 'condition',
    field: 'name',
    operator: 'contains',
    value: 'acme',
  };

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
});
