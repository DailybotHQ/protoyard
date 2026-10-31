import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileFilter, type FilterGroup, FilterSchema, type Segment } from '@protoyard/analytics';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BreakdownSelect from '../src/filters/BreakdownSelect.svelte';
import FilterBuilder from '../src/filters/FilterBuilder.svelte';
import {
  adjustCondition,
  BUILDER_OPERATORS,
  builderFields,
  describeFilter,
  type FilterProperty,
  fromBuilderFilter,
  parseScalar,
  saveErrorOf,
  toBuilderFilter,
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
  const condition = (n: number) => screen.getByRole('group', { name: `Condition ${n}` });
  const choose = (select: HTMLElement, value: string) =>
    fireEvent.change(select, { target: { value } });

  it("builds a filter with Texuli's builder that is valid FilterSchema data and filters rows", async () => {
    const onchange = vi.fn();
    render(FilterBuilder, { value: EMPTY, properties: PROPERTIES, onchange });
    expect(document.querySelector('[data-tx-filter-builder]')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    // First property is Plan (with options): the builder lists the labels.
    const plan = within(condition(1)).getByRole('combobox', { name: 'Value' });
    expect([...plan.querySelectorAll('option')].map((o) => o.textContent)).toContain('Pro');
    await choose(plan, 'Pro');
    await fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    await choose(within(condition(2)).getByRole('combobox', { name: 'Field' }), 'properties.seats');
    // Protoyard's "at least" is a catalog operator on number properties.
    await choose(within(condition(2)).getByRole('combobox', { name: 'Operator' }), 'gte');
    await fireEvent.input(within(condition(2)).getByRole('spinbutton', { name: 'Value' }), {
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

  it('offers every Protoyard operator of a property type, in order', async () => {
    render(FilterBuilder, {
      value: {
        combinator: 'and',
        conditions: [
          { property: 'properties.country', operator: 'not_in', value: ['NZ'] },
          { property: 'at', operator: 'gte', value: '2026-10-01' },
        ],
      },
      properties: PROPERTIES,
      onchange: vi.fn(),
    });
    const names = (n: number) =>
      [
        ...within(condition(n))
          .getByRole('combobox', { name: 'Operator' })
          .querySelectorAll('option'),
      ].map((o) => o.textContent);
    expect(names(1)).toEqual([
      'is',
      'is not',
      'contains',
      'does not contain',
      'starts with',
      'is any of',
      'is none of',
      'is set',
      'is not set',
    ]);
    expect(names(2)).toEqual([
      'is after',
      'on or after',
      'is before',
      'on or before',
      'between',
      'is set',
      'is not set',
    ]);
    expect(
      (within(condition(1)).getByRole('textbox', { name: 'Value' }) as HTMLInputElement).value
    ).toBe('NZ');
  });

  it('switches to OR, nests a group, removes it and round-trips the model', async () => {
    const onchange = vi.fn();
    render(FilterBuilder, {
      value: {
        combinator: 'and',
        conditions: [{ property: 'properties.trial', operator: 'eq', value: true }],
      },
      properties: PROPERTIES,
      onchange,
    });
    await choose(screen.getAllByRole('combobox', { name: 'Match' })[0] as HTMLElement, 'or');
    await fireEvent.click(screen.getByRole('button', { name: 'Add group' }));
    expect(screen.getAllByRole('combobox', { name: 'Match' })).toHaveLength(2);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove group 2' }));
    expect(screen.getAllByRole('combobox', { name: 'Match' })).toHaveLength(1);
    await fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(onchange).toHaveBeenCalled());
    expect(onchange.mock.calls[0]?.[0]).toEqual({
      combinator: 'or',
      conditions: [{ property: 'properties.trial', operator: 'eq', value: true }],
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Remove condition 1' }));
    expect(screen.queryByRole('group', { name: 'Condition 1' })).toBeNull();
  });

  it('shows restored property, operator and option labels', () => {
    render(FilterBuilder, {
      value: {
        combinator: 'and',
        conditions: [{ property: 'properties.plan', operator: 'eq', value: 'pro' }],
      },
      properties: PROPERTIES,
      onchange: vi.fn(),
    });
    const selected = (name: string) => {
      const select = within(condition(1)).getByRole('combobox', { name }) as HTMLSelectElement;
      return select.selectedOptions[0]?.textContent;
    };
    expect(selected('Field')).toBe('Plan');
    expect(selected('Operator')).toBe('is');
    expect(selected('Value')).toBe('Pro');
  });

  it('lists validation errors by condition and does not apply', async () => {
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
    const list = screen.getByRole('list', { name: 'Filter errors' });
    expect(list.textContent?.trim()).toBe('Condition 1: Enter a value');
    expect(screen.getByText('Fix the listed field to apply')).toBeTruthy();
    expect(onchange).not.toHaveBeenCalled();
  });
});

describe('builder bridge', () => {
  it('round-trips every operator and option labels between the two models', () => {
    const filter: FilterGroup = {
      combinator: 'and',
      conditions: [
        { property: 'properties.plan', operator: 'in', value: ['pro', 'free'] },
        { property: 'properties.plan', operator: 'contains', value: 'r' },
        { property: 'properties.seats', operator: 'between', value: [1, 5] },
        { property: 'properties.seats', operator: 'not_in', value: [2, 3] },
        { property: 'properties.country', operator: 'starts_with', value: 'N' },
        { property: 'at', operator: 'lt', value: '2026-10-01' },
        {
          combinator: 'or',
          conditions: [{ property: 'properties.trial', operator: 'is_set', value: null }],
        },
      ],
    };
    const model = toBuilderFilter(filter, PROPERTIES);
    expect(model.children[0]).toEqual({
      type: 'condition',
      field: 'properties.plan',
      operator: 'in',
      value: ['Pro', 'Free'],
    });
    expect(model.children[1]).toMatchObject({ operator: 'containsText' });
    expect(model.children[5]).toMatchObject({ operator: 'before' });
    expect(fromBuilderFilter(model, PROPERTIES)).toEqual(filter);
    // A comma list on a number property comes back as numbers.
    expect(
      fromBuilderFilter(
        {
          type: 'group',
          op: 'and',
          children: [
            { type: 'condition', field: 'properties.seats', operator: 'notIn', value: ['2', '3'] },
          ],
        },
        PROPERTIES
      ).conditions[0]
    ).toEqual({ property: 'properties.seats', operator: 'not_in', value: [2, 3] });
  });

  it('every catalog operator id is valid for Texuli and offered only where it fits', async () => {
    const { applyFilter } = await import('@texuli/data/filter-builder');
    const fields = builderFields(PROPERTIES);
    const data = rows.map((r) => ({ ...r.properties }));
    const seatsAtLeast = {
      type: 'group' as const,
      op: 'and' as const,
      children: [{ type: 'condition' as const, field: 'seats', operator: 'gte', value: 3 }],
    };
    const flat = fields.map((f) => ({ ...f, key: f.key.replace('properties.', '') }));
    expect(
      applyFilter(data, seatsAtLeast, flat as never, BUILDER_OPERATORS as never).map((r) => r.seats)
    ).toEqual([12, 3]);
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
    const view = render(SegmentPicker, {
      segments,
      activeId: 'seg_1',
      onapply,
      properties: PROPERTIES,
      filter,
    });
    const pro = screen.getByRole('button', { name: 'Pro users' });
    expect(pro.getAttribute('aria-pressed')).toBe('true');
    expect(pro.getAttribute('title')).toBe('Plan is Pro');
    await fireEvent.click(screen.getByRole('button', { name: 'Everyone' }));
    expect(onapply).toHaveBeenCalledWith(null);
    expect(pro.getAttribute('aria-pressed')).toBe('true');
    view.rerender({ segments, activeId: null, onapply, properties: PROPERTIES, filter });
    await fireEvent.click(pro);
    expect(onapply).toHaveBeenLastCalledWith(segments[0]);
  });

  it('keeps pressed state controlled by activeId and supports uncontrolled selection', async () => {
    const onapply = vi.fn();
    const view = render(SegmentPicker, {
      segments,
      activeId: 'seg_1',
      onapply,
      properties: PROPERTIES,
      filter,
    });
    const pro = screen.getByRole('button', { name: 'Pro users' });
    const everyone = screen.getByRole('button', { name: 'Everyone' });
    expect(pro.getAttribute('aria-pressed')).toBe('true');
    expect(everyone.getAttribute('aria-pressed')).toBe('false');
    await fireEvent.click(everyone);
    expect(everyone.getAttribute('aria-pressed')).toBe('false');
    view.rerender({
      segments,
      activeId: null,
      onapply,
      properties: PROPERTIES,
      filter,
    });
    expect(everyone.getAttribute('aria-pressed')).toBe('true');
    view.unmount();

    const uncontrolled = render(SegmentPicker, {
      segments,
      onapply,
      properties: PROPERTIES,
      filter,
    });
    const uncontrolledPro = within(uncontrolled.container).getByRole('button', {
      name: 'Pro users',
    });
    await fireEvent.click(uncontrolledPro);
    expect(uncontrolledPro.getAttribute('aria-pressed')).toBe('true');
    uncontrolled.unmount();
  });

  it('handles Texuli keyboard activation through pressed-state changes', () => {
    const source = readFileSync(
      join(import.meta.dirname, '../src/filters/SegmentPicker.svelte'),
      'utf8'
    );
    expect(source).toContain('onPressedChange={(pressed) =>');
    expect(source).not.toContain('onclick={() => onapply');
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
  it('shows the selected label while closed', () => {
    render(BreakdownSelect, {
      properties: PROPERTIES,
      value: 'properties.plan',
      onchange: vi.fn(),
    });
    expect(screen.getByRole('combobox', { name: 'Break down by' }).textContent).toContain('Plan');
  });

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
