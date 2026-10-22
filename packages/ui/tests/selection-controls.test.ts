import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChipGroup from '../src/components/ChipGroup.svelte';
import NumberStepper from '../src/components/NumberStepper.svelte';
import RadioGroup from '../src/components/radio-group/RadioGroup.svelte';
import StarRating from '../src/components/StarRating.svelte';

afterEach(() => cleanup());

describe('StarRating', () => {
  it('selects by click and announces the value', async () => {
    const onchange = vi.fn();
    render(StarRating, { label: 'Experience', value: 0, onchange });
    const group = screen.getByRole('radiogroup', { name: 'Experience' });
    await fireEvent.click(within(group).getByRole('radio', { name: '4 of 5 stars' }));
    expect(onchange).toHaveBeenCalledWith(4);
    expect(screen.getByText('4 of 5')).toBeTruthy();
    expect(
      within(group).getByRole('radio', { name: '4 of 5 stars' }).getAttribute('aria-checked')
    ).toBe('true');
  });

  it('moves with arrow keys and wraps via Home/End', async () => {
    render(StarRating, { label: 'Score', value: 1 });
    const first = screen.getByRole('radio', { name: '1 of 5 stars' });
    first.focus();
    await fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: '2 of 5 stars' }).getAttribute('aria-checked')).toBe(
      'true'
    );
    await fireEvent.keyDown(screen.getByRole('radio', { name: '2 of 5 stars' }), { key: 'Home' });
    expect(screen.getByRole('radio', { name: '1 of 5 stars' }).getAttribute('aria-checked')).toBe(
      'true'
    );
    await fireEvent.keyDown(screen.getByRole('radio', { name: '1 of 5 stars' }), { key: 'End' });
    expect(screen.getByRole('radio', { name: '5 of 5 stars' }).getAttribute('aria-checked')).toBe(
      'true'
    );
  });

  it('respects disabled', async () => {
    const onchange = vi.fn();
    render(StarRating, { label: 'Locked', value: 2, disabled: true, onchange });
    await fireEvent.click(screen.getByRole('radio', { name: '5 of 5 stars' }));
    expect(onchange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: '5 of 5 stars' }).hasAttribute('disabled')).toBe(true);
  });
});

describe('NumberStepper', () => {
  it('increments and decrements within min/max and stays labelled', async () => {
    const onchange = vi.fn();
    render(NumberStepper, {
      label: 'Guests',
      value: 2,
      min: 1,
      max: 4,
      step: 1,
      onchange,
    });
    const spin = screen.getByRole('spinbutton', { name: 'Guests' });
    expect(spin.getAttribute('aria-valuenow')).toBe('2');
    await fireEvent.click(screen.getByRole('button', { name: 'Increase Guests' }));
    expect(onchange).toHaveBeenCalledWith(3);
    expect(spin.getAttribute('aria-valuenow')).toBe('3');
    await fireEvent.click(screen.getByRole('button', { name: 'Increase Guests' }));
    expect(onchange).toHaveBeenLastCalledWith(4);
    expect(screen.getByRole('button', { name: 'Increase Guests' }).hasAttribute('disabled')).toBe(
      true
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Decrease Guests' }));
    expect(onchange).toHaveBeenLastCalledWith(3);
  });

  it('supports arrow keys on the spinbutton', async () => {
    const onchange = vi.fn();
    render(NumberStepper, { label: 'Quantity', value: 5, min: 0, max: 10, step: 2, onchange });
    const spin = screen.getByRole('spinbutton', { name: 'Quantity' });
    spin.focus();
    await fireEvent.keyDown(spin, { key: 'ArrowUp' });
    expect(onchange).toHaveBeenCalledWith(7);
    await fireEvent.keyDown(spin, { key: 'Home' });
    expect(onchange).toHaveBeenLastCalledWith(0);
  });
});

describe('ChipGroup', () => {
  const items = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma', disabled: true },
  ];

  it('single mode selects one chip with mouse and arrows', async () => {
    const onchange = vi.fn();
    render(ChipGroup, { label: 'Plan', items, mode: 'single', value: [], onchange });
    const group = screen.getByRole('radiogroup', { name: 'Plan' });
    await fireEvent.click(within(group).getByRole('radio', { name: 'Alpha' }));
    expect(onchange).toHaveBeenCalledWith(['a']);
    const alpha = within(group).getByRole('radio', { name: 'Alpha' });
    await fireEvent.keyDown(alpha, { key: 'ArrowRight' });
    expect(onchange).toHaveBeenLastCalledWith(['b']);
    expect(within(group).getByRole('radio', { name: 'Gamma' }).hasAttribute('disabled')).toBe(true);
  });

  it('multi mode toggles chips with click and Space', async () => {
    const onchange = vi.fn();
    render(ChipGroup, { label: 'Tags', items, mode: 'multi', value: ['a'], onchange });
    const group = screen.getByRole('group', { name: 'Tags' });
    const beta = within(group).getByRole('button', { name: 'Beta' });
    await fireEvent.click(beta);
    expect(onchange).toHaveBeenCalledWith(['a', 'b']);
    beta.focus();
    await fireEvent.keyDown(beta, { key: ' ' });
    expect(onchange).toHaveBeenLastCalledWith(['a']);
  });
});

describe('RadioGroup card variant', () => {
  it('renders selectable cards with descriptions', async () => {
    const items = [
      { value: 'basic', label: 'Basic', description: 'For individuals' },
      { value: 'team', label: 'Team', description: 'For small teams' },
    ];
    render(RadioGroup, { items, variant: 'card', value: 'basic' });
    const group = screen.getByRole('radiogroup');
    expect(group.getAttribute('data-variant')).toBe('card');
    expect(screen.getByText('For individuals')).toBeTruthy();
    expect(screen.getByText('For small teams')).toBeTruthy();
    const cards = group.querySelectorAll('label');
    expect(cards.length).toBe(2);
    expect(cards[0]?.className).toMatch(/rounded-xl/);
    const teamRadio = screen.getByRole('radio', { name: /Team/i });
    await fireEvent.click(teamRadio);
    expect(
      teamRadio.getAttribute('data-state') === 'checked' ||
        teamRadio.getAttribute('aria-checked') === 'true'
    ).toBe(true);
  });
});
