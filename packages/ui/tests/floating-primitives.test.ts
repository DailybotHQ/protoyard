import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FloatingHarness from './fixtures/FloatingHarness.svelte';
import PickersHarness from './fixtures/PickersHarness.svelte';

/*
 * Tooltip, Popover, DropdownMenu, Select, Combobox and Command (CommandPalette,
 * UserPicker) run on @texuli/primitives. These cover the seams the wrappers
 * own: labels through a consumer id, a custom combobox filter and its form
 * value, the popover's ref and onOpenFocus, menu headings and actions, and
 * people search by name or subtitle.
 */

afterEach(() => cleanup());

describe('Texuli-backed floating controls', () => {
  it('names a Select by its <label for> through the consumer id', () => {
    render(PickersHarness);
    expect(screen.getByLabelText('Stage').getAttribute('role')).toBe('combobox');
    expect(screen.getByRole('combobox', { name: 'Stage' })).toBeTruthy();
  });

  it('filters a combobox with the consumer filter (accents and values)', async () => {
    render(FloatingHarness);
    const input = screen.getByRole('combobox', { name: 'Time zone' }) as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'sao paulo' } });
    expect(await screen.findByRole('option', { name: 'São Paulo' })).toBeTruthy();
    await fireEvent.input(input, { target: { value: 'new_york' } });
    expect(await screen.findByRole('option', { name: 'New York' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Tokyo' })).toBeNull();
  });

  it('submits the chosen combobox value under its name', async () => {
    render(FloatingHarness);
    const input = screen.getByRole('combobox', { name: 'Time zone' });
    await fireEvent.input(input, { target: { value: 'tok' } });
    await fireEvent.click(await screen.findByRole('option', { name: 'Tokyo' }));
    const form = screen.getByTestId('form') as HTMLFormElement;
    await waitFor(() => expect(new FormData(form).get('zone')).toBe('Asia/Tokyo'));
    expect((input as HTMLInputElement).value).toBe('Tokyo');
  });

  it('shows the tooltip on focus and describes its trigger', async () => {
    render(FloatingHarness);
    const save = screen.getByRole('button', { name: 'Save' });
    await fireEvent.focusIn(save);
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('Saves the draft');
    expect(save.getAttribute('aria-describedby')).toContain(tip.id);
  });

  it('opens the menu with its labelled group and runs an action', async () => {
    const onSelected = vi.fn();
    render(FloatingHarness, { onSelected });
    const trigger = screen.getByRole('button', { name: 'Actions' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    await fireEvent.click(trigger);
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('group', { name: 'Deal' })).toBeTruthy();
    expect(within(menu).getByRole('separator')).toBeTruthy();
    await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
    expect(onSelected).toHaveBeenCalledWith('Delete');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('binds the popover ref and moves focus with onOpenFocus', async () => {
    render(FloatingHarness);
    await fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    await waitFor(() => expect(screen.getByTestId('popover-ref').textContent).toBe('dialog'));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Preferred' }))
    );
  });

  it('finds people by name or subtitle and picks one', async () => {
    render(FloatingHarness);
    await fireEvent.click(screen.getByRole('button', { name: 'Owner' }));
    const search = await screen.findByRole('combobox', { name: 'Owner' });
    await fireEvent.input(search, { target: { value: 'finance' } });
    expect(screen.getByRole('option', { name: /Bo Example/ })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Ada Example/ })?.hidden ?? true).toBe(true);
    await fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByTestId('person').textContent).toBe('u2');
  });
});
