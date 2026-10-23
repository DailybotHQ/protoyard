import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommandPalette from '../src/components/command-palette/CommandPalette.svelte';
import type { CommandPaletteItem } from '../src/components/command-palette/types.ts';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const recentItems: CommandPaletteItem[] = [
  { id: 'home', label: 'Home', group: 'Pages' },
  { id: 'projects', label: 'Projects', group: 'Pages', description: 'Browse projects' },
];

describe('CommandPalette', () => {
  it('opens from Ctrl+K and shows recent items', async () => {
    render(CommandPalette, {
      search: vi.fn().mockResolvedValue([]),
      onSelect: vi.fn(),
      recentItems,
    });

    await fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Home' })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Projects Browse projects/ })).toBeTruthy();
  });

  it('debounces async search, groups plain-text results, and selects with the keyboard', async () => {
    const search = vi.fn().mockResolvedValue([
      { id: 'account', label: '<b>Account</b>', group: 'Records' },
      { id: 'invite', label: 'Invite teammate', group: 'Actions' },
    ] satisfies CommandPaletteItem[]);
    const onSelect = vi.fn();
    render(CommandPalette, { search, onSelect, recentItems, debounceMs: 10 });
    await fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const input = await screen.findByRole('combobox', { name: 'Search commands' });
    await fireEvent.input(input, { target: { value: 'in' } });
    await fireEvent.input(input, { target: { value: 'inv' } });
    await waitFor(() => expect(search).toHaveBeenCalledOnce());
    expect(search).toHaveBeenCalledWith('inv');
    expect(await screen.findByText('Records')).toBeTruthy();
    expect(screen.getByText('<b>Account</b>').tagName).toBe('SPAN');
    expect(screen.getByText('Actions')).toBeTruthy();

    // The first result starts highlighted; ArrowDown moves to the next one.
    const account = screen.getByRole('option', { name: '<b>Account</b>' });
    expect(input.getAttribute('aria-activedescendant')).toBe(account.id);
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    const invite = screen.getByRole('option', { name: 'Invite teammate' });
    expect(input.getAttribute('aria-activedescendant')).toBe(invite.id);
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'invite' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog').getAttribute('data-state')).toBe('closed')
    );
  });

  it('ignores stale async results when a newer query resolves first', async () => {
    let resolveFirst: ((items: CommandPaletteItem[]) => void) | undefined;
    const search = vi.fn((query: string) => {
      if (query === 'old') {
        return new Promise<CommandPaletteItem[]>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve([{ id: 'new', label: 'New result', group: 'Pages' }]);
    });
    render(CommandPalette, { search, onSelect: vi.fn(), debounceMs: 0 });
    await fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = await screen.findByRole('combobox', { name: 'Search commands' });

    await fireEvent.input(input, { target: { value: 'old' } });
    await waitFor(() => expect(search).toHaveBeenCalledWith('old'));
    await fireEvent.input(input, { target: { value: 'new' } });
    expect(await screen.findByRole('option', { name: 'New result' })).toBeTruthy();
    resolveFirst?.([{ id: 'old', label: 'Old result', group: 'Pages' }]);
    await Promise.resolve();

    expect(screen.queryByRole('option', { name: 'Old result' })).toBeNull();
  });

  it('restores focus to the element that opened it after Escape', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open search';
    document.body.append(opener);
    opener.focus();
    render(CommandPalette, { search: vi.fn().mockResolvedValue([]), onSelect: vi.fn() });
    await fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' });

    await fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
