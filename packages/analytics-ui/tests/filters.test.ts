import { compileFilter, type FilterGroup, FilterSchema, type Segment } from '@protoyard/analytics';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BreakdownSelect from '../src/filters/BreakdownSelect.svelte';
import FilterBuilder from '../src/filters/FilterBuilder.svelte';
import {
  adjustCondition,
  describeFilter,
  type FilterProperty,
  parseScalar,
  saveErrorOf,
  validateFilter,
} from '../src/filters/model.ts';
import SegmentPicker from '../src/filters/SegmentPicker.svelte';

afterEach(cleanup);

const PROPERTIES: FilterProperty[] = [
  {
    path: 'properties.plan',
    label: 'Plan',
    type: 'string',
    options: [
      { value: 'free', label: 'Free' },
      { value: 'pro', label: 'Pro' },
    ],
  },
  { path: 'properties.country', label: 'Country', type: 'string' },
  { path: 'properties.seats', label: 'Seats', type: 'number' },
  { path: 'properties.trial', label: 'On trial', type: 'boolean' },
  { path: 'at', label: 'Date', type: 'date' },
];
const EMPTY: FilterGroup = { combinator: 'and', conditions: [] };
const rows = [
  { userId: 'a', properties: { plan: 'pro', country: 'NZ', seats: 12 } },
  { userId: 'b', properties: { plan: 'free', country: 'CA', seats: 1 } },
  { userId: 'c', properties: { plan: 'pro', country: 'CA', seats: 3 } },
];

describe('filter model', () => {
  it('parses form text into typed values', () => {
    expect(parseScalar(' 12 ', 'number')).toBe(12);
    expect(parseScalar('abc', 'number')).toBeNull();
    expect(parseScalar('', 'string')).toBeNull();
    expect(parseScalar('true', 'boolean')).toBe(true);
  });

  it('keeps values that still fit when the property or operator changes', () => {
    const seats = PROPERTIES[2] as FilterProperty;
    const plan = PROPERTIES[0] as FilterProperty;
    expect(
      adjustCondition({ property: 'properties.plan', operator: 'contains', value: 'pr' }, seats)
    ).toEqual({
      property: 'properties.seats',
      operator: 'eq',
      value: 'pr',
    });
    expect(
      adjustCondition({ property: 'properties.plan', operator: 'in', value: 'pro' }, plan).value
    ).toEqual(['pro']);
    expect(
      adjustCondition({ property: 'properties.seats', operator: 'between', value: 3 }, seats).value
    ).toEqual([null, null]);
    expect(
      adjustCondition({ property: 'properties.seats', operator: 'is_set', value: 3 }, seats).value
    ).toBeNull();
  });

  it('describes filters in words and validates against the catalog', () => {
    const filter: FilterGroup = {
      combinator: 'and',
      conditions: [
        { property: 'properties.plan', operator: 'eq', value: 'pro' },
        {
          combinator: 'or',
          conditions: [
            { property: 'properties.country', operator: 'in', value: ['NZ', 'CA'] },
            { property: 'properties.seats', operator: 'gte', value: 5 },
          ],
        },
      ],
    };
    expect(describeFilter(filter, PROPERTIES)).toBe(
      'Plan is Pro and (Country is any of NZ, CA or Seats at least 5)'
    );
    expect(describeFilter(EMPTY, PROPERTIES)).toBe('Everyone');
    expect(validateFilter(filter, PROPERTIES).ok).toBe(true);
    const bad = validateFilter(
      {
        combinator: 'and',
        conditions: [{ property: 'properties.region', operator: 'eq', value: 'EU' }],
      },
      PROPERTIES
    );
    expect(bad.errors).toEqual({ 'conditions.0.property': 'Unknown property "properties.region"' });
  });

  it('turns save failures into inline messages', () => {
    const permission = Object.assign(new Error('denied'), {
      name: 'PermissionDeniedError',
      capability: 'segment.create',
    });
    expect(saveErrorOf(permission).message).toBe("Your role can't save segments");
    const validation = Object.assign(new Error('invalid'), {
      issues: { name: 'A segment with this name exists' },
    });
    expect(saveErrorOf(validation).field).toEqual({ name: 'A segment with this name exists' });
    expect(
      saveErrorOf(Object.assign(new Error('You are offline'), { name: 'SimulatedServiceError' }))
        .message
    ).toBe('You are offline');
  });
});

describe('FilterBuilder', () => {
  it('builds a filter that is valid FilterSchema data and filters rows', async () => {
    const onchange = vi.fn();
    render(FilterBuilder, { value: EMPTY, properties: PROPERTIES, onchange });
    await fireEvent.click(screen.getByRole('button', { name: '+ Add condition' }));
    // First property is Plan (with options): choose Pro.
    await fireEvent.change(screen.getByRole('combobox', { name: 'Value' }), {
      target: { value: 'pro' },
    });
    await fireEvent.click(screen.getByRole('button', { name: '+ Add condition' }));
    const second = document.querySelectorAll('[data-condition]')[1] as HTMLElement;
    await fireEvent.change(within(second).getByRole('combobox', { name: 'Property' }), {
      target: { value: 'properties.seats' },
    });
    await fireEvent.change(within(second).getByRole('combobox', { name: 'Operator' }), {
      target: { value: 'gte' },
    });
    await fireEvent.input(within(second).getByRole('spinbutton', { name: 'Value' }), {
      target: { value: '5' },
    });
    expect(document.querySelector('[data-filter-summary]')?.textContent).toBe(
      'Plan is Pro and Seats at least 5'
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(onchange).toHaveBeenCalledTimes(1));
    const filter = onchange.mock.calls[0]?.[0] as FilterGroup;
    expect(FilterSchema.safeParse(filter).success).toBe(true);
    expect(filter).toEqual({
      combinator: 'and',
      conditions: [
        { property: 'properties.plan', operator: 'eq', value: 'pro' },
        { property: 'properties.seats', operator: 'gte', value: 5 },
      ],
    });
    expect(rows.filter(compileFilter(filter)).map((r) => r.userId)).toEqual(['a']);
  });

  it('switches to OR, nests a group and removes conditions', async () => {
    const onchange = vi.fn();
    render(FilterBuilder, {
      value: {
        combinator: 'and',
        conditions: [{ property: 'properties.trial', operator: 'eq', value: true }],
      },
      properties: PROPERTIES,
      onchange,
    });
    const root = screen.getAllByRole('group', { name: 'Match' })[0] as HTMLElement;
    await fireEvent.click(within(root).getByRole('button', { name: 'Any condition' }));
    await fireEvent.click(screen.getAllByRole('button', { name: '+ Add group' })[0] as HTMLElement);
    expect(screen.getAllByRole('group', { name: 'Match' })).toHaveLength(2);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove group' }));
    expect(screen.getAllByRole('group', { name: 'Match' })).toHaveLength(1);
    await fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(onchange).toHaveBeenCalled());
    expect(onchange.mock.calls[0]?.[0]).toEqual({
      combinator: 'or',
      conditions: [{ property: 'properties.trial', operator: 'eq', value: true }],
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Remove condition 1' }));
    expect(document.querySelectorAll('[data-condition]')).toHaveLength(0);
  });

  it('shows validation errors inline and does not apply', async () => {
    const onchange = vi.fn();
    render(FilterBuilder, {
      value: {
        combinator: 'and',
        conditions: [{ property: 'properties.seats', operator: 'gt', value: null }],
      },
      properties: PROPERTIES,
      onchange,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    const input = screen.getByRole('spinbutton', { name: 'Value' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const errorId = input.getAttribute('aria-describedby');
    expect(errorId && document.getElementById(errorId)?.textContent).toBe('Enter a value');
    expect(screen.getByText('Fix the highlighted field to apply')).toBeTruthy();
    expect(onchange).not.toHaveBeenCalled();
  });
});

describe('SegmentPicker', () => {
  const segments: Segment[] = [
    {
      id: 'seg_1',
      name: 'Pro users',
      filter: {
        combinator: 'and',
        conditions: [{ property: 'properties.plan', operator: 'eq', value: 'pro' }],
      },
    },
  ];
  const filter: FilterGroup = {
    combinator: 'and',
    conditions: [{ property: 'properties.country', operator: 'eq', value: 'CA' }],
  };

  it('applies saved segments and everyone', async () => {
    const onapply = vi.fn();
    render(SegmentPicker, { segments, activeId: 'seg_1', onapply, properties: PROPERTIES, filter });
    const pro = screen.getByRole('button', { name: 'Pro users' });
    expect(pro.getAttribute('aria-pressed')).toBe('true');
    expect(pro.getAttribute('title')).toBe('Plan is Pro');
    await fireEvent.click(screen.getByRole('button', { name: 'Everyone' }));
    expect(onapply).toHaveBeenCalledWith(null);
    await fireEvent.click(pro);
    expect(onapply).toHaveBeenLastCalledWith(segments[0]);
  });

  it('saves through the service with pending feedback, then confirms', async () => {
    let finish: (value: unknown) => void = () => {};
    const onsave = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    render(SegmentPicker, { segments, onapply: () => {}, properties: PROPERTIES, filter, onsave });
    await fireEvent.input(screen.getByLabelText('Save current filter as a segment'), {
      target: { value: ' Canada ' },
    });
    const save = screen.getByRole('button', { name: 'Save segment' });
    await fireEvent.click(save);
    expect(onsave).toHaveBeenCalledWith({ name: 'Canada', filter });
    expect(save.getAttribute('aria-busy')).toBe('true');
    finish({ ok: true, value: { id: 'seg_2' } });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved “Canada”'));
    expect(save.getAttribute('aria-busy')).toBeNull();
    expect(
      (screen.getByLabelText('Save current filter as a segment') as HTMLInputElement).value
    ).toBe('');
  });

  it('surfaces a permission error from the service and keeps the name', async () => {
    const denied = Object.assign(new Error('Not allowed'), {
      name: 'PermissionDeniedError',
      capability: 'segment.create',
    });
    const onsave = vi.fn(async () => ({ ok: false, error: denied }));
    render(SegmentPicker, { segments, onapply: () => {}, properties: PROPERTIES, filter, onsave });
    await fireEvent.input(screen.getByLabelText('Save current filter as a segment'), {
      target: { value: 'Canada' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Save segment' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe("Your role can't save segments")
    );
    expect(
      (screen.getByLabelText('Save current filter as a segment') as HTMLInputElement).value
    ).toBe('Canada');
  });

  it('shows field errors from validation and requires a name', async () => {
    const onsave = vi.fn(async () => {
      throw Object.assign(new Error('invalid'), {
        issues: { name: 'A segment with this name exists' },
      });
    });
    render(SegmentPicker, { segments, onapply: () => {}, properties: PROPERTIES, filter, onsave });
    await fireEvent.click(screen.getByRole('button', { name: 'Save segment' }));
    expect(screen.getByText('Name the segment')).toBeTruthy();
    expect(onsave).not.toHaveBeenCalled();
    await fireEvent.input(screen.getByLabelText('Save current filter as a segment'), {
      target: { value: 'Pro users' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Save segment' }));
    await waitFor(() => expect(screen.getByText('A segment with this name exists')).toBeTruthy());
    expect(
      screen.getByLabelText('Save current filter as a segment').getAttribute('aria-invalid')
    ).toBe('true');
  });
});

describe('BreakdownSelect', () => {
  it('offers category properties only and emits the chosen path', async () => {
    const onchange = vi.fn();
    render(BreakdownSelect, { properties: PROPERTIES, value: null, onchange });
    const select = screen.getByRole('combobox', { name: 'Break down by' });
    await fireEvent.click(select);
    expect(screen.getAllByRole('option').map((o) => o.textContent?.trim())).toEqual([
      'None',
      'Plan',
      'Country',
      'On trial',
    ]);
    await fireEvent.click(screen.getByRole('option', { name: 'Plan' }));
    expect(onchange).toHaveBeenLastCalledWith('properties.plan');
    await fireEvent.click(select);
    await fireEvent.click(screen.getByRole('option', { name: 'None' }));
    expect(onchange).toHaveBeenLastCalledWith(null);
  });
});
