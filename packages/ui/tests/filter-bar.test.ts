import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyFilters,
  buildFilterChips,
  clearFilterChip,
  hasActiveFilters,
  isFilterActive,
  resetFilterValues,
} from '../src/components/filter-bar/apply-filters.ts';
import type { FilterField, FilterValues } from '../src/components/filter-bar/types.ts';
import FilterBarHarness from './fixtures/FilterBarHarness.svelte';

interface Deal {
  id: string;
  name: string;
  stage: string;
  ownerId: string;
  active: boolean;
  createdAt: Date;
}

const deals: Deal[] = [
  {
    id: 'd1',
    name: 'Acme',
    stage: 'open',
    ownerId: 'u1',
    active: true,
    createdAt: new Date(2024, 0, 15),
  },
  {
    id: 'd2',
    name: 'Beta',
    stage: 'won',
    ownerId: 'u2',
    active: false,
    createdAt: new Date(2024, 2, 10),
  },
  {
    id: 'd3',
    name: 'Gamma',
    stage: 'open',
    ownerId: 'u1',
    active: true,
    createdAt: new Date(2024, 5, 1),
  },
  {
    id: 'd4',
    name: 'Delta',
    stage: 'lost',
    ownerId: 'u3',
    active: false,
    createdAt: new Date(2023, 11, 20),
  },
];

const fields: FilterField<Deal>[] = [
  {
    id: 'stage',
    kind: 'enum',
    label: 'Stage',
    options: [
      { value: 'open', label: 'Open' },
      { value: 'won', label: 'Won' },
      { value: 'lost', label: 'Lost' },
    ],
  },
  {
    id: 'ownerId',
    kind: 'relation',
    label: 'Owner',
    multiple: true,
    options: [
      { value: 'u1', label: 'Alex' },
      { value: 'u2', label: 'Blair' },
      { value: 'u3', label: 'Casey' },
    ],
  },
  {
    id: 'active',
    kind: 'boolean',
    label: 'Active',
    trueLabel: 'Active',
    falseLabel: 'Archived',
  },
  {
    id: 'createdAt',
    kind: 'date-range',
    label: 'Created',
  },
];

afterEach(() => cleanup());

describe('applyFilters', () => {
  it('returns all rows when no filters are active', () => {
    expect(applyFilters(deals, fields, {})).toEqual(deals);
    expect(applyFilters(deals, fields, { stage: null, active: undefined })).toEqual(deals);
  });

  it('filters enum values with string equality', () => {
    const result = applyFilters(deals, fields, { stage: 'open' });
    expect(result.map((d) => d.id)).toEqual(['d1', 'd3']);
  });

  it('ORs multiple enum/relation values and ANDs across fields', () => {
    const result = applyFilters(deals, fields, {
      stage: ['open', 'won'],
      ownerId: ['u1'],
    });
    expect(result.map((d) => d.id)).toEqual(['d1', 'd3']);
  });

  it('filters booleans', () => {
    expect(applyFilters(deals, fields, { active: true }).map((d) => d.id)).toEqual(['d1', 'd3']);
    expect(applyFilters(deals, fields, { active: false }).map((d) => d.id)).toEqual(['d2', 'd4']);
  });

  it('filters inclusive date ranges on calendar days', () => {
    const inRange = applyFilters(deals, fields, {
      createdAt: { from: '2024-01-01', to: '2024-03-31' },
    });
    expect(inRange.map((d) => d.id)).toEqual(['d1', 'd2']);

    const fromOnly = applyFilters(deals, fields, { createdAt: { from: '2024-03-01' } });
    expect(fromOnly.map((d) => d.id)).toEqual(['d2', 'd3']);

    const toOnly = applyFilters(deals, fields, { createdAt: { to: '2024-01-31' } });
    expect(toOnly.map((d) => d.id)).toEqual(['d1', 'd4']);
  });

  it('uses accessor when provided', () => {
    const custom: FilterField<Deal>[] = [
      {
        id: 'nameLen',
        kind: 'enum',
        label: 'Name length',
        accessor: (row) => String(row.name.length),
        options: [
          { value: '4', label: '4' },
          { value: '5', label: '5' },
        ],
      },
    ];
    expect(applyFilters(deals, custom, { nameLen: '4' }).map((d) => d.name)).toEqual([
      'Acme',
      'Beta',
    ]);
  });

  it('exposes active helpers and chip builders for URL-serializable values', () => {
    const values: FilterValues = {
      stage: 'won',
      ownerId: ['u1', 'u2'],
      active: true,
      createdAt: { from: '2024-01-01', to: '2024-06-30' },
    };
    expect(isFilterActive(fields[0]!, values.stage)).toBe(true);
    expect(isFilterActive(fields[0]!, [])).toBe(false);
    expect(hasActiveFilters(fields, values)).toBe(true);

    const chips = buildFilterChips(fields, values);
    expect(chips.map((c) => c.label)).toEqual([
      'Stage: Won',
      'Owner: Alex',
      'Owner: Blair',
      'Active: Active',
      'Created: 2024-01-01 → 2024-06-30',
    ]);

    const afterOwner = clearFilterChip(fields, values, { fieldId: 'ownerId', value: 'u1' });
    expect(afterOwner.ownerId).toEqual(['u2']);

    const cleared = clearFilterChip(fields, afterOwner, { fieldId: 'ownerId', value: 'u2' });
    expect(cleared.ownerId).toBeNull();

    const reset = resetFilterValues(fields);
    expect(reset).toEqual({
      stage: null,
      ownerId: null,
      active: null,
      createdAt: null,
    });
    expect(JSON.parse(JSON.stringify(values))).toEqual(values);
  });
});

describe('FilterBar', () => {
  it('renders chips for active filters and removes one on chip click', async () => {
    const onValuesChange = vi.fn();
    render(FilterBarHarness, {
      fields,
      values: { stage: 'open', active: true } satisfies FilterValues,
      onValuesChange,
    });

    const chipList = screen.getByRole('list', { name: 'Active filters' });
    expect(
      within(chipList).getByRole('button', { name: 'Remove filter: Stage: Open' })
    ).toBeTruthy();
    expect(
      within(chipList).getByRole('button', { name: 'Remove filter: Active: Active' })
    ).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Stage: Open' }));

    expect(onValuesChange).toHaveBeenCalled();
    const next = onValuesChange.mock.calls.at(-1)?.[0] as FilterValues;
    expect(next.stage).toBeNull();
    expect(next.active).toBe(true);
    expect(screen.queryByRole('button', { name: 'Remove filter: Stage: Open' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove filter: Active: Active' })).toBeTruthy();
  });

  it('resets every active filter', async () => {
    const onValuesChange = vi.fn();
    render(FilterBarHarness, {
      fields,
      values: {
        stage: 'won',
        ownerId: ['u2'],
        active: false,
        createdAt: { from: '2024-01-01' },
      } satisfies FilterValues,
      onValuesChange,
    });

    expect(screen.getByRole('list', { name: 'Active filters' }).children).toHaveLength(4);
    await fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));

    expect(onValuesChange).toHaveBeenCalledWith({
      stage: null,
      ownerId: null,
      active: null,
      createdAt: null,
    });
    expect(screen.queryByRole('list', { name: 'Active filters' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset filters' })).toBeNull();
  });

  it('removes a single value from a multi-select relation chip', async () => {
    const onValuesChange = vi.fn();
    render(FilterBarHarness, {
      fields,
      values: { ownerId: ['u1', 'u2'] } satisfies FilterValues,
      onValuesChange,
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Owner: Alex' }));
    expect(onValuesChange.mock.calls.at(-1)?.[0]).toMatchObject({ ownerId: ['u2'] });
    expect(screen.getByRole('button', { name: 'Remove filter: Owner: Blair' })).toBeTruthy();
  });
});
