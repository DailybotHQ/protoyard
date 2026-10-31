import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AlertDialog from '../src/components/alert-dialog/AlertDialog.svelte';
import CommandPalette from '../src/components/command-palette/CommandPalette.svelte';
import DataTable from '../src/components/data-table/DataTable.svelte';
import Drawer from '../src/components/overlay/Drawer.svelte';
import UndoToaster from '../src/components/toast/UndoToaster.svelte';
import UserPicker from '../src/components/user-picker/UserPicker.svelte';
import ContractHarness from './fixtures/ContractHarness.svelte';

/**
 * Details of the uniform contract the shared contract test does not pin:
 * the caller's attributes merge with the component's own (style, labels), and
 * the new `open` prop of the command palette.
 */

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

const users = [
  { id: 'u1', name: 'Ada Example' },
  { id: 'u2', name: 'Grace Example' },
];

describe('rest attributes and ref forwarding', () => {
  it('AlertDialog: attributes reach the alert content and the caller style keeps the layer z-index', async () => {
    const onCancel = vi.fn();
    render(AlertDialog, {
      open: true,
      title: 'Delete record?',
      onCancel,
      'data-testid': 'alert',
      style: 'max-width: 20rem',
    });
    const alert = await screen.findByRole('alertdialog', { name: 'Delete record?' });
    expect(alert.dataset.testid).toBe('alert');
    expect(alert.getAttribute('style')).toContain('max-width: 20rem');
    expect(alert.getAttribute('style')).toMatch(/z-index:\s*\d+/);
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });

  it('Drawer: attributes reach the content and the caller style keeps the drawer size', async () => {
    render(Drawer, {
      open: true,
      title: 'Filters',
      id: 'filters-drawer',
      style: 'color: red',
      size: 320,
    });
    const drawer = await screen.findByRole('dialog', { name: 'Filters' });
    expect(drawer.id).toBe('filters-drawer');
    const style = drawer.getAttribute('style') ?? '';
    expect(style).toContain('color: red');
    expect(style).toMatch(/--ui-drawer-size:\s*320px/);
  });

  it('UndoToaster: attributes and ref land on the region; its label stays', async () => {
    let ref: unknown = null;
    render(ContractHarness, {
      props: {
        component: UndoToaster as never,
        props: { 'data-region': 'undo', label: 'Undo actions' },
        onRef: (value: unknown) => {
          ref = value;
        },
      },
    });
    flushSync();
    await tick();
    const region = screen.getByRole('region', { hidden: true, name: 'Undo actions' });
    expect(region.dataset.region).toBe('undo');
    expect(ref).toBe(region);
  });

  it('DataTable: the ref is the root holding the table', async () => {
    let ref: HTMLElement | null = null;
    render(ContractHarness, {
      props: {
        component: DataTable as never,
        props: {
          columns: [{ key: 'name', header: 'Name' }],
          rows: [{ id: '1', name: 'Ada' }],
          getRowId: (row: { id: string }) => row.id,
          caption: 'People',
          'aria-describedby': 'people-hint',
        },
        onRef: (value: unknown) => {
          ref = value as HTMLElement;
        },
      },
    });
    flushSync();
    await tick();
    const root = ref as unknown as HTMLElement;
    expect(root.getAttribute('aria-describedby')).toBe('people-hint');
    expect(root.contains(screen.getByRole('table'))).toBe(true);
  });
});

describe('UserPicker', () => {
  it('runs a caller onclick on the trigger first; preventDefault keeps the list closed', async () => {
    const onclick = vi.fn((event: MouseEvent) => event.preventDefault());
    render(UserPicker, { users, label: 'Assignee', onclick });
    const trigger = screen.getByRole('button', { name: 'Assignee' });
    await fireEvent.click(trigger);
    expect(onclick).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens on click when the caller handler does not prevent it', async () => {
    const onclick = vi.fn();
    render(UserPicker, { users, label: 'Assignee', onclick });
    const trigger = screen.getByRole('button', { name: 'Assignee' });
    await fireEvent.click(trigger);
    expect(onclick).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('inline: attributes land on the list card', () => {
    const { container } = render(UserPicker, {
      users,
      label: 'Assignee',
      variant: 'inline',
      'data-picker': 'inline',
    });
    const card = container.querySelector<HTMLElement>('[data-picker="inline"]');
    expect(card?.dataset.txCard).toBe('');
  });
});

describe('CommandPalette open prop', () => {
  it('opens from the prop, takes attributes on its content and returns focus on close', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open palette';
    document.body.append(opener);
    opener.focus();

    render(CommandPalette, {
      open: true,
      search: vi.fn().mockResolvedValue([]),
      onSelect: vi.fn(),
      'data-palette': 'main',
    });
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' });
    expect(dialog.dataset.palette).toBe('main');

    await fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull()
    );
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
