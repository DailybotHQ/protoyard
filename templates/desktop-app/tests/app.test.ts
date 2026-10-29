import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { DesktopDatabase } from '../src/database/schema.ts';
import { definition } from '../src/prototype.ts';
import AppHost from './AppHost.svelte';

/**
 * The whole App on the real runtime: shortcuts, menu-driven actions and the
 * unsaved-changes guard. happy-dom reports a non-Mac platform, so the
 * modifier is Ctrl.
 */
let harness = createHarness<DesktopDatabase>(definition);
afterEach(() => {
  cleanup();
  location.hash = '';
  harness.closeAll();
  harness = createHarness<DesktopDatabase>(definition);
});

const press = (init: KeyboardEventInit) => fireEvent.keyDown(window, init);

describe('desktop app shell', () => {
  it('creates and saves a document with Alt+N and Ctrl+S, persisting it', async () => {
    const runtime = await harness.boot('empty');
    render(AppHost, { runtime });
    // New documents go to the current folder, else the first one (the Inbox).
    await screen.findByRole('button', { name: /Inbox/ });
    expect(await runtime.db.documents.count()).toBe(0);

    await press({ code: 'KeyN', key: 'n', altKey: true });
    const title = await screen.findByLabelText('Title');
    expect((title as HTMLInputElement).value).toBe('Untitled');
    expect(await runtime.db.documents.count()).toBe(1);

    await fireEvent.input(title, { target: { value: 'Quarterly plan' } });
    await fireEvent.input(screen.getByLabelText('Body'), { target: { value: 'Grow the beta.' } });
    expect(screen.getByTestId('save-status').textContent).toMatch(/Unsaved changes/);

    await press({ code: 'KeyS', key: 's', ctrlKey: true });
    await waitFor(async () => {
      const [doc] = await runtime.db.documents.toArray();
      expect(doc).toMatchObject({ title: 'Quarterly plan', body: 'Grow the beta.' });
    });
    await waitFor(() => expect(screen.getByTestId('save-status').textContent).toMatch(/^Saved/));
    expect(screen.getByTestId('document-list').textContent).toContain('Quarterly plan');
  });

  it('keeps the New document Button pending until its create service settles', async () => {
    const runtime = await harness.boot('empty');
    runtime.environment.set({ latencyMs: 300 });
    render(AppHost, { runtime });
    const create = await screen.findByRole('button', { name: 'New document' });
    (create as HTMLButtonElement).click();
    await waitFor(() => expect(create.getAttribute('aria-busy')).toBe('true'));
    await waitFor(() => expect(create.getAttribute('aria-busy')).toBeNull());
  });

  it('asks before Alt+W discards unsaved edits, and keeps them on "Keep editing"', async () => {
    const runtime = await harness.boot('active');
    const doc = await runtime.db.documents.toCollection().first();
    if (!doc) throw new Error('the active scenario has documents');
    location.hash = `#/folders/${doc.folderId}?doc=${doc.id}`;
    render(AppHost, { runtime });
    const title = (await screen.findByLabelText('Title')) as HTMLInputElement;
    await fireEvent.input(title, { target: { value: 'Changed' } });

    await press({ code: 'KeyW', key: 'w', altKey: true });
    const prompt = await screen.findByRole('alertdialog');
    expect(prompt.textContent).toMatch(/Discard unsaved changes/);
    await fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Changed');

    await press({ code: 'KeyW', key: 'w', altKey: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(screen.queryByLabelText('Title')).toBeNull());
    expect((await runtime.db.documents.get(doc.id))?.title).toBe(doc.title);
  });

  it('lists every shortcut in the help dialog opened with "?"', async () => {
    const runtime = await harness.boot('active');
    render(AppHost, { runtime });
    await screen.findByRole('navigation', { name: 'Application menu' });
    await press({ key: '?', code: 'Slash', shiftKey: true });
    const list = await screen.findByTestId('shortcut-list');
    for (const label of ['New document', 'Save document', 'Search documents', 'Close document']) {
      expect(list.textContent).toContain(label);
    }
    expect(list.textContent).toContain('Ctrl+S');
  });

  it('shows a read-only editor and no create actions to a viewer', async () => {
    const runtime = await harness.boot('active');
    await runtime.session.switchActor('user_0003');
    const doc = await runtime.db.documents.toCollection().first();
    if (!doc) throw new Error('the active scenario has documents');
    location.hash = `#/?doc=${doc.id}`;
    render(AppHost, { runtime });
    const title = (await screen.findByLabelText('Title')) as HTMLInputElement;
    expect(title.readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'New document' })).toBeNull();
    expect(screen.getByTestId('save-status').textContent).toMatch(/Read-only/);
    const before = await runtime.db.documents.count();
    await press({ code: 'KeyN', key: 'n', altKey: true });
    expect(await runtime.db.documents.count()).toBe(before);
  });
});
