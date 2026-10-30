import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChipGroup from '../src/components/ChipGroup.svelte';
import DatePicker from '../src/components/form/scheduling/DatePicker.svelte';
import DateRangePicker from '../src/components/form/scheduling/DateRangePicker.svelte';
import TimeZoneSelect from '../src/components/form/scheduling/TimeZoneSelect.svelte';
import EmojiPicker from '../src/components/form/utilities/EmojiPicker.svelte';
import NumberStepper from '../src/components/NumberStepper.svelte';
import StarRating from '../src/components/StarRating.svelte';
import ContractHarness from './fixtures/ContractHarness.svelte';

/**
 * The uniform contract on the form controls, past what contract.test.ts
 * checks: rest attributes reach the control inside the root, a caller name
 * replaces the visible label, and caller handlers compose with the
 * component's own (caller first; `preventDefault()` skips the own handling
 * only where it is optional).
 */

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function renderWithRef(component: unknown, props: Record<string, unknown>) {
  let ref: HTMLElement | null = null;
  render(ContractHarness, {
    props: {
      component: component as never,
      props,
      onRef: (value: unknown) => {
        ref = value as HTMLElement | null;
      },
    },
  });
  flushSync();
  return () => ref;
}

async function typeDate(group: HTMLElement, iso: string) {
  const [year = '', month = '', day = ''] = iso.split('-');
  for (const [name, value] of [
    ['Year', String(Number(year))],
    ['Month', String(Number(month))],
    ['Day', String(Number(day))],
  ] as const) {
    const input = within(group).getByRole('spinbutton', { name }) as HTMLInputElement;
    await fireEvent.input(input, { target: { value } });
  }
}

describe('DatePicker and DateRangePicker', () => {
  it('route rest attributes to the date group inside the bound root', () => {
    const ref = renderWithRef(DatePicker, {
      'aria-label': 'Due',
      'data-field': 'due',
      locale: 'en-US',
    });
    const group = screen.getByRole('group', { name: 'Due' });
    expect(group.getAttribute('data-field')).toBe('due');
    expect(ref()?.contains(group)).toBe(true);
    expect(ref()).not.toBe(group);
    cleanup();

    const rangeRef = renderWithRef(DateRangePicker, {
      label: 'Stay',
      'data-field': 'stay',
      locale: 'en-US',
    });
    const range = document.querySelector<HTMLElement>('[data-field="stay"]');
    expect(range?.getAttribute('role')).toBe('group');
    expect(rangeRef()?.contains(range)).toBe(true);
  });

  it('runs a caller onfocusout first and still commits the typed date', async () => {
    const order: string[] = [];
    render(DatePicker, {
      'aria-label': 'Due',
      locale: 'en-US',
      onfocusout: () => order.push('caller'),
      onValueChange: (value: string | null) => order.push(`value:${value}`),
    });
    const group = screen.getByRole('group', { name: 'Due' });
    await typeDate(group, '2026-03-10');
    await fireEvent.focusOut(group, { relatedTarget: null });
    expect(order).toEqual(['caller', 'value:2026-03-10']);
  });

  it('skips the Enter commit only when the caller onkeydown prevents it', async () => {
    const onValueChange = vi.fn();
    render(DatePicker, {
      'aria-label': 'Due',
      locale: 'en-US',
      onValueChange,
      onkeydown: (event: KeyboardEvent) => {
        if (event.key === 'Enter' && event.shiftKey) event.preventDefault();
      },
    });
    const group = screen.getByRole('group', { name: 'Due' });
    await typeDate(group, '2026-03-10');
    await fireEvent.keyDown(group, { key: 'Enter', shiftKey: true });
    expect(onValueChange).not.toHaveBeenCalled();
    await fireEvent.keyDown(group, { key: 'Enter' });
    expect(onValueChange).toHaveBeenCalledWith('2026-03-10');
  });
});

describe('EmojiPicker', () => {
  it('runs a caller onclick on the trigger before it opens the picker', async () => {
    const order: string[] = [];
    const ref = renderWithRef(EmojiPicker, {
      label: 'Reaction',
      'data-trigger': '',
      onclick: (event: MouseEvent) =>
        order.push(`caller:${(event.currentTarget as HTMLElement).getAttribute('aria-expanded')}`),
    });
    const trigger = screen.getByRole('button', { name: 'Reaction' });
    expect(trigger.hasAttribute('data-trigger')).toBe(true);
    expect(ref()?.contains(trigger)).toBe(true);
    await fireEvent.click(trigger);
    expect(order).toEqual(['caller:false']);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('stays closed when the caller onclick prevents the default', async () => {
    render(EmojiPicker, {
      label: 'Reaction',
      onclick: (event: MouseEvent) => event.preventDefault(),
    });
    const trigger = screen.getByRole('button', { name: 'Reaction' });
    await fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('caller names and attributes on the control', () => {
  it('NumberStepper: rest lands on the number input; a caller aria-label replaces the label', () => {
    const ref = renderWithRef(NumberStepper, {
      label: 'Seats',
      'aria-describedby': 'seats-hint',
      'data-input': '',
    });
    const input = document.querySelector<HTMLInputElement>('[data-input]');
    expect(input?.tagName).toBe('INPUT');
    expect(input?.getAttribute('aria-describedby')).toBe('seats-hint');
    expect(ref()?.contains(input)).toBe(true);
    expect(screen.getByRole('spinbutton', { name: 'Seats' })).toBe(input);
    cleanup();

    render(NumberStepper, { label: 'Seats', 'aria-label': 'Seats per team' });
    expect(screen.getByRole('spinbutton', { name: 'Seats per team' })).toBeTruthy();
  });

  it('ChipGroup: rest lands on the toggle group; a caller aria-label replaces the label', () => {
    const items = [{ value: 'a', label: 'Alpha' }];
    const ref = renderWithRef(ChipGroup, { items, label: 'Kind', 'data-group': '' });
    const group = screen.getByRole('group', { name: 'Kind' });
    expect(group.hasAttribute('data-group')).toBe(true);
    expect(ref()?.contains(group)).toBe(true);
    cleanup();

    render(ChipGroup, { items, label: 'Kind', 'aria-label': 'Record kind' });
    expect(screen.getByRole('group', { name: 'Record kind' })).toBeTruthy();
  });

  it('StarRating: aria-* reach the radio group, the ref is Texuli’s root', () => {
    const ref = renderWithRef(StarRating, { label: 'Rating', 'aria-describedby': 'rating-hint' });
    const group = screen.getByRole('radiogroup');
    expect(group.getAttribute('aria-describedby')).toBe('rating-hint');
    expect(ref()?.contains(group)).toBe(true);
  });

  it('TimeZoneSelect: the ref and rest attributes are the search input’s', () => {
    const ref = renderWithRef(TimeZoneSelect, {
      'aria-label': 'Time zone',
      zones: ['UTC', 'America/Bogota'],
      referenceDate: Date.UTC(2026, 0, 1),
      'data-zone': '',
    });
    const input = screen.getByRole('combobox', { name: 'Time zone' });
    expect(input.hasAttribute('data-zone')).toBe(true);
    expect(ref()).toBe(input);
  });
});
