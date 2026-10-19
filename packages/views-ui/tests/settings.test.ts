import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DangerZone,
  guardHashNavigation,
  RadioRow,
  SaveBar,
  SelectRow,
  SettingsLayout,
  SwitchRow,
} from '../src/settings/index.ts';

afterEach(() => {
  cleanup();
  history.replaceState(null, '', '#/');
});

const sectionBody = createRawSnippet((id: () => string) => ({
  render: () => `<p data-testid="body">Body of ${id()}</p>`,
}));

const SECTIONS = [
  { id: 'profile', label: 'Profile', description: 'Name and avatar' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'billing', label: 'Billing' },
];

const nextHash = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Bits UI keeps a closing dialog in the DOM for its exit animation; read its state instead. */
function dialogState(role: 'dialog' | 'alertdialog'): string {
  const node = document.querySelector(`[role="${role}"]`);
  return node?.getAttribute('data-state') ?? 'closed';
}

describe('SettingsLayout', () => {
  it('switches sections, marks the current one and focuses its heading', async () => {
    const onSelect = vi.fn();
    render(SettingsLayout, { sections: SECTIONS, onSelect, children: sectionBody });
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(screen.getByTestId('body').textContent).toBe('Body of profile');
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toContain('Profile');
    await fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await tick();
    expect(onSelect).toHaveBeenCalledWith('notifications');
    expect(screen.getByTestId('body').textContent).toBe('Body of notifications');
    expect(screen.getByRole('heading', { level: 2, name: 'Notifications' })).toBe(
      document.activeElement
    );
  });

  it('is a list → detail flow on phones, with a back button that restores focus', async () => {
    render(SettingsLayout, { sections: SECTIONS, children: sectionBody });
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    const detail = screen.getByRole('heading', { level: 2 }).closest('section') as HTMLElement;
    // Phones start on the list; the md: classes show both columns on wider screens.
    expect(nav.className).toMatch(/(^| )block( |$)/);
    expect(detail.className).toMatch(/(^| )hidden( |$)/);
    await fireEvent.click(screen.getByRole('button', { name: /Billing/ }));
    await tick();
    expect(nav.className).toMatch(/(^| )hidden( |$)/);
    expect(detail.className).toMatch(/(^| )block( |$)/);
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await tick();
    expect(nav.className).toMatch(/(^| )block( |$)/);
    expect(document.activeElement?.textContent).toContain('Billing');
  });
});

describe('SaveBar', () => {
  it('appears only while dirty and saves with pending feedback', async () => {
    let resolve: (value: unknown) => void = () => {};
    const onSave = vi.fn(() => new Promise((r) => (resolve = r)));
    const view = render(SaveBar, { dirty: false, onSave, onDiscard: vi.fn() });
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
    await view.rerender({ dirty: true, onSave, onDiscard: vi.fn() });
    const save = screen.getByRole('button', { name: 'Save changes' });
    await fireEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(save.getAttribute('aria-busy')).toBe('true'));
    expect((screen.getByRole('button', { name: 'Discard' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    resolve({ ok: true, value: null });
    await waitFor(() => expect(save.hasAttribute('aria-busy')).toBe(false));
  });

  it('shows the field errors of a failed runService result', async () => {
    const invalid = Object.assign(new Error('Invalid settings'), {
      issues: { displayName: 'Required', timezone: 'Unknown time zone' },
    });
    render(SaveBar, {
      dirty: true,
      onSave: async () => ({ ok: false, error: invalid }),
      onDiscard: vi.fn(),
      fieldLabels: { displayName: 'Display name' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Display name: Required');
    expect(alert.textContent).toContain('timezone: Unknown time zone');
  });

  it('discards through its callback', async () => {
    const onDiscard = vi.fn();
    render(SaveBar, { dirty: true, onSave: vi.fn(), onDiscard });
    await fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  describe('navigation guard', () => {
    // Stands in for the hash router: a normal listener registered before the SaveBar.
    // Like the router, it only acts when the location really changed (happy-dom also
    // fires hashchange twice per assignment).
    const routerSaw: string[] = [];
    let routerAt = '';
    const router = () => {
      if (location.hash === routerAt) return;
      routerAt = location.hash;
      routerSaw.push(location.hash);
    };
    beforeEach(() => {
      routerSaw.length = 0;
      history.replaceState(null, '', '#/settings');
      routerAt = location.hash;
      window.addEventListener('hashchange', router);
    });
    afterEach(() => window.removeEventListener('hashchange', router));

    it('keeps the screen while dirty and asks before leaving', async () => {
      const onDiscard = vi.fn();
      render(SaveBar, { dirty: true, onSave: vi.fn(), onDiscard });
      location.hash = '#/deals';
      await nextHash();
      expect(location.hash).toBe('#/settings');
      expect(routerSaw).toEqual([]);
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog.textContent).toContain('Leave without saving?');

      await fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
      await waitFor(() => expect(dialogState('alertdialog')).toBe('closed'));
      expect(location.hash).toBe('#/settings');
      expect(onDiscard).not.toHaveBeenCalled();

      location.hash = '#/deals';
      await nextHash();
      await fireEvent.click(await screen.findByRole('button', { name: 'Discard and leave' }));
      await waitFor(() => expect(location.hash).toBe('#/deals'));
      expect(onDiscard).toHaveBeenCalledTimes(1);
      expect(routerSaw).toEqual(['#/deals']);
    });

    it('lets navigation through when clean or when the guard is off', async () => {
      const view = render(SaveBar, { dirty: false, onSave: vi.fn(), onDiscard: vi.fn() });
      location.hash = '#/deals';
      await nextHash();
      expect(routerSaw).toEqual(['#/deals']);
      await view.rerender({ dirty: true, guard: false, onSave: vi.fn(), onDiscard: vi.fn() });
      location.hash = '#/contacts';
      await nextHash();
      expect(routerSaw).toEqual(['#/deals', '#/contacts']);
    });

    it('asks before a reload while dirty', () => {
      let dirty = true;
      const stop = guardHashNavigation({ isDirty: () => dirty, onBlocked: vi.fn() });
      const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      dirty = false;
      const clean = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(clean);
      expect(clean.defaultPrevented).toBe(false);
      stop();
    });
  });
});

describe('DangerZone', () => {
  it('requires the exact confirmation text, and closes only on success', async () => {
    const onConfirm = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: new Error('offline') })
      .mockResolvedValueOnce({ ok: true, value: null });
    render(DangerZone, {
      description: 'Deletes the Northwind workspace and all of its records.',
      actionLabel: 'Delete workspace',
      confirmText: 'northwind',
      onConfirm,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Delete workspace' }));
    const dialog = await screen.findByRole('dialog');
    const input = screen.getByLabelText(/Type northwind to confirm/);
    const confirm = () =>
      [...dialog.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Delete workspace'
      ) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    await fireEvent.input(input, { target: { value: 'Northwind' } });
    expect(confirm().disabled).toBe(true); // exact text, case included
    await fireEvent.input(input, { target: { value: 'northwind' } });
    expect(confirm().disabled).toBe(false);
    await fireEvent.click(confirm());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(dialogState('dialog')).toBe('open'); // failed: still open
    await fireEvent.click(confirm());
    await waitFor(() => expect(dialogState('dialog')).toBe('closed'));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('explains why the action is unavailable', () => {
    render(DangerZone, {
      description: 'Deletes the workspace.',
      actionLabel: 'Delete workspace',
      confirmText: 'x',
      onConfirm: vi.fn(),
      disabled: true,
      disabledReason: 'Only owners can delete a workspace.',
    });
    expect(
      (screen.getByRole('button', { name: 'Delete workspace' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByText('Only owners can delete a workspace.')).toBeTruthy();
  });
});

describe('preference rows', () => {
  it('labels and toggles a switch row', async () => {
    const onCheckedChange = vi.fn();
    render(SwitchRow, {
      label: 'Weekly digest',
      description: 'A summary every Monday.',
      onCheckedChange,
    });
    const toggle = screen.getByRole('switch', { name: 'Weekly digest' });
    expect(toggle.getAttribute('aria-describedby')).toBeTruthy();
    expect(
      document.getElementById(toggle.getAttribute('aria-describedby') ?? '')?.textContent
    ).toBe('A summary every Monday.');
    await fireEvent.click(toggle);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('names select and radio rows', () => {
    render(SelectRow, {
      label: 'Time zone',
      items: [
        { value: 'UTC', label: 'UTC' },
        { value: 'America/Bogota', label: 'Bogotá' },
      ],
      value: 'UTC',
    });
    // The Select trigger is a listbox button named by the row label.
    const trigger = screen.getByRole('button', { name: 'Time zone' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    cleanup();
    render(RadioRow, {
      label: 'Density',
      description: 'How much fits on screen.',
      items: [
        { value: 'compact', label: 'Compact' },
        { value: 'comfortable', label: 'Comfortable', description: 'The default' },
      ],
      value: 'comfortable',
    });
    expect(screen.getByRole('group', { name: 'Density' })).toBeTruthy();
    expect(
      (screen.getByRole('radio', { name: /Comfortable/ }) as HTMLElement).getAttribute(
        'aria-checked'
      )
    ).toBe('true');
  });
});
