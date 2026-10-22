import { PermissionDeniedError, type Principal } from '@protoyard/core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AppCommandPalette,
  type CommandEntry,
  createCommands,
  isMacPlatform,
  normalizeShortcut,
  type RouteLike,
  ShortcutSheet,
  shortcutKeys,
} from '../src/commands/index.ts';

afterEach(() => {
  cleanup();
  history.replaceState(null, '', '#/');
});

/** A session whose capabilities can change, like a DevTools persona switch. */
function fakeSession(initial: string[]) {
  let capabilities = new Set(initial);
  const listeners = new Set<(principal: Principal | null) => void>();
  return {
    can: (capability: string) => capabilities.has(capability),
    assert: (capability: string) => {
      if (!capabilities.has(capability)) throw new PermissionDeniedError(capability, 'viewer');
    },
    subscribe: (listener: (principal: Principal | null) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    switchPersona(next: string[]) {
      capabilities = new Set(next);
      for (const listener of listeners) listener(null);
    },
  };
}

const load = vi.fn(async () => ({ default: (() => {}) as never }));
const ROUTES: (RouteLike & { load: typeof load })[] = [
  { path: '/', name: 'Dashboard', description: 'Pipeline at a glance', load },
  { path: '/deals', name: 'Deals', description: 'Browse deals', capability: 'deals:read', load },
  { path: '/deals/:id', name: 'Deal', description: 'One deal', capability: 'deals:read', load },
  {
    path: '/admin',
    name: 'Admin',
    description: 'Workspace admin',
    capability: 'admin:manage',
    load,
  },
  { path: '/docs/*', name: 'Docs', description: 'Help pages', load },
];

const ids = (entries: { id: string }[]) => entries.map((entry) => entry.id);
const mod = () => (isMacPlatform() ? { metaKey: true } : { ctrlKey: true });

describe('createCommands', () => {
  it('lists navigable pages the persona may open, without loading any screen', () => {
    const session = fakeSession(['deals:read']);
    const commands = createCommands({ session }, ROUTES);
    expect(ids(commands.list())).toEqual(['page:/', 'page:/deals']);
    expect(load).not.toHaveBeenCalled();
  });

  it('re-filters when the persona changes and tells subscribers', () => {
    const session = fakeSession([]);
    const commands = createCommands({ session }, ROUTES);
    const onChange = vi.fn();
    commands.subscribe(onChange);
    expect(ids(commands.list())).toEqual(['page:/']);
    session.switchPersona(['deals:read', 'admin:manage']);
    expect(onChange).toHaveBeenCalled();
    expect(ids(commands.list())).toEqual(['page:/', 'page:/deals', 'page:/admin']);
    commands.destroy();
    session.switchPersona([]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('registers actions with capabilities and shortcuts, and keeps mod+k and mod+. free', () => {
    const session = fakeSession(['deals:create']);
    const commands = createCommands({ session }, []);
    const remove = commands.register({
      id: 'new-deal',
      label: 'New deal',
      shortcut: 'Mod+Shift+N',
      capability: 'deals:create',
      run: () => {},
    });
    commands.register({
      id: 'export',
      label: 'Export deals',
      capability: 'deals:export',
      run: () => {},
    });
    expect(ids(commands.list())).toEqual(['action:new-deal']);
    expect(commands.find('action:new-deal')?.shortcut).toBe('mod+shift+n');
    expect(() =>
      commands.register({ id: 'x', label: 'X', shortcut: 'mod+k', run: () => {} })
    ).toThrow(RangeError);
    expect(() =>
      commands.register({ id: 'y', label: 'Y', shortcut: 'Mod+.', run: () => {} })
    ).toThrow(RangeError);
    remove();
    expect(commands.list()).toEqual([]);
    expect(normalizeShortcut('Shift+Mod+P')).toBe('mod+shift+p');
  });

  it('ranks search results and keeps recent records first, deduplicated and capped', () => {
    const session = fakeSession(['deals:read']);
    const commands = createCommands({ session }, ROUTES, { maxRecent: 2 });
    commands.register({ id: 'new-deal', label: 'New deal', keywords: ['create'], run: () => {} });
    commands.addRecent({
      id: 'd1',
      label: 'Northwind renewal',
      path: '/deals/d1',
      capability: 'deals:read',
    });
    commands.addRecent({ id: 'd2', label: 'Acme expansion', path: '/deals/d2' });
    commands.addRecent({ id: 'd1', label: 'Northwind renewal', path: '/deals/d1' });
    commands.addRecent({ id: 'd3', label: 'Globex pilot', path: '/deals/d3' });
    expect(ids(commands.list()).slice(0, 2)).toEqual(['recent:d3', 'recent:d1']);
    // Label matches first; the recent deals match through their /deals/… path, last.
    expect(ids(commands.search('deal'))).toEqual([
      'page:/deals',
      'action:new-deal',
      'recent:d3',
      'recent:d1',
    ]);
    expect(ids(commands.search('create'))).toEqual(['action:new-deal']);
    expect(ids(commands.search('glob'))).toEqual(['recent:d3']);
  });

  it('asserts the capability when an action runs', async () => {
    const session = fakeSession(['deals:create']);
    const run = vi.fn();
    const commands = createCommands({ session }, []);
    commands.register({ id: 'new-deal', label: 'New deal', capability: 'deals:create', run });
    const entry = commands.find('action:new-deal');
    session.switchPersona([]);
    await expect(commands.run(entry as never)).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('AppCommandPalette', () => {
  it('opens on mod+k, loading the dialog only then, and ignores mod+. and DevTools keys', async () => {
    const commands = createCommands({ session: fakeSession(['deals:read']) }, ROUTES);
    render(AppCommandPalette, { registry: commands });
    expect(screen.queryByRole('dialog')).toBeNull();
    await fireEvent.keyDown(window, { key: '.', ...mod() });
    expect(screen.queryByRole('dialog')).toBeNull();

    const devtools = document.body.appendChild(document.createElement('div'));
    devtools.dataset.protoyardDevtools = '';
    const field = devtools.appendChild(document.createElement('input'));
    await fireEvent.keyDown(field, { key: 'k', ...mod() });
    expect(screen.queryByRole('dialog')).toBeNull();
    devtools.remove();

    await fireEvent.keyDown(window, { key: 'k', ...mod() });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Deals')).toBeTruthy();
    expect(within(dialog).queryByText('Admin')).toBeNull();
  });

  it('navigates to a page and closes', async () => {
    const commands = createCommands({ session: fakeSession(['deals:read']) }, ROUTES);
    render(AppCommandPalette, { registry: commands });
    await fireEvent.keyDown(window, { key: 'k', ...mod() });
    await fireEvent.click(await screen.findByText('Deals'));
    await waitFor(() => expect(location.hash).toBe('#/deals'));
  });

  it('shows pending feedback while an async action runs, then closes', async () => {
    let finish: () => void = () => {};
    const run = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const commands = createCommands({ session: fakeSession(['deals:create']) }, []);
    commands.register({
      id: 'new-deal',
      label: 'New deal',
      capability: 'deals:create',
      shortcut: 'mod+shift+n',
      run,
    });
    render(AppCommandPalette, { registry: commands });
    await fireEvent.keyDown(window, { key: 'k', ...mod() });
    const dialog = await screen.findByRole('dialog');
    const keys = shortcutKeys('mod+shift+n', isMacPlatform());
    expect(within(dialog).getAllByText(keys[0] as string).length).toBeGreaterThan(0);
    const item = within(dialog).getByText('New deal').closest('[data-command-item]') as HTMLElement;
    await fireEvent.click(item);
    await waitFor(() => expect(item.getAttribute('aria-busy')).toBe('true'));
    expect(within(dialog).getByText('Running')).toBeTruthy();
    expect(dialog.getAttribute('data-state')).toBe('open');
    finish();
    await waitFor(() =>
      expect(
        document.querySelector('[role="dialog"]')?.getAttribute('data-state') ?? 'closed'
      ).toBe('closed')
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('updates the open list when the persona switches', async () => {
    const session = fakeSession(['deals:read']);
    const commands = createCommands({ session }, ROUTES);
    render(AppCommandPalette, { registry: commands });
    await fireEvent.keyDown(window, { key: 'k', ...mod() });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('Admin')).toBeNull();
    session.switchPersona(['deals:read', 'admin:manage']);
    await waitFor(() => expect(within(dialog).getByText('Admin')).toBeTruthy());
  });

  it('runs action shortcuts globally, but not single keys while typing', async () => {
    const save = vi.fn();
    const archive = vi.fn();
    const commands = createCommands({ session: fakeSession([]) }, []);
    commands.register({ id: 'save', label: 'Save', shortcut: 'mod+s', run: save });
    commands.register({ id: 'archive', label: 'Archive', shortcut: 'e', run: archive });
    render(AppCommandPalette, { registry: commands });
    await fireEvent.keyDown(window, { key: 's', ...mod() });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const input = document.body.appendChild(document.createElement('input'));
    await fireEvent.keyDown(input, { key: 'e' });
    expect(archive).not.toHaveBeenCalled();
    await fireEvent.keyDown(document.body, { key: 'e' });
    await waitFor(() => expect(archive).toHaveBeenCalledTimes(1));
    input.remove();
  });

  it('renders a trigger with the platform shortcut', async () => {
    const commands = createCommands({ session: fakeSession([]) }, ROUTES);
    const { createRawSnippet } = await import('svelte');
    const trigger = createRawSnippet((props: () => { open: () => void; keys: string[] }) => ({
      render: () => `<button type="button">Search ${props().keys.join('')}</button>`,
      setup: (node) => {
        node.addEventListener('click', () => props().open());
      },
    }));
    render(AppCommandPalette, { registry: commands, trigger });
    const button = screen.getByRole('button', { name: /^Search/ });
    expect(button.textContent).toContain(isMacPlatform() ? '⌘K' : 'CtrlK');
    await fireEvent.click(button);
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('searches async providers with pending feedback and ignores stale query results', async () => {
    const commands = createCommands({ session: fakeSession([]) }, []);
    let resolveSearch: (entries: CommandEntry[]) => void = () => {};
    commands.registerSearchSource((query) => {
      if (query === 'late') {
        return new Promise((resolve) => {
          resolveSearch = resolve;
        });
      }
      return Promise.resolve([
        {
          id: 'search:latest',
          kind: 'page',
          label: 'Latest result',
          group: 'Search',
          keywords: [],
        },
      ]);
    });
    render(AppCommandPalette, { registry: commands });
    await fireEvent.keyDown(window, { key: 'k', ...mod() });
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByRole('combobox');
    await fireEvent.input(input, { target: { value: 'late' } });
    expect(within(dialog).getByText('Searching…')).toBeTruthy();
    await fireEvent.input(input, { target: { value: 'latest' } });
    expect(await within(dialog).findByText('Latest result')).toBeTruthy();
    resolveSearch([
      { id: 'search:stale', kind: 'page', label: 'Stale result', group: 'Search', keywords: [] },
    ]);
    await waitFor(() => expect(within(dialog).queryByText('Stale result')).toBeNull());
    commands.destroy();
  });

  it('drills into nested command steps and returns to the parent list', async () => {
    const commands = createCommands({ session: fakeSession([]) }, []);
    commands.register({
      id: 'manage',
      label: 'Manage project',
      children: [
        {
          id: 'action:rename',
          kind: 'action',
          label: 'Rename project',
          group: 'Project',
          keywords: [],
          run: vi.fn(),
        },
      ],
    });
    render(AppCommandPalette, { registry: commands });
    await fireEvent.keyDown(window, { key: 'k', ...mod() });
    const dialog = await screen.findByRole('dialog');
    await fireEvent.click(within(dialog).getByText('Manage project'));
    expect(await within(dialog).findByText('Rename project')).toBeTruthy();
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Back' }));
    expect(await within(dialog).findByText('Manage project')).toBeTruthy();
    expect(within(dialog).queryByText('Rename project')).toBeNull();
    commands.destroy();
  });

  it('offers a create fallback for typed text and runs it through pending feedback', async () => {
    let finish: () => void = () => {};
    const run = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const commands = createCommands({ session: fakeSession([]) }, [], {
      createFallback: (query) => ({ id: 'create-item', label: `Create “${query}”`, run }),
    });
    render(AppCommandPalette, { registry: commands });
    await fireEvent.keyDown(window, { key: 'k', ...mod() });
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByRole('combobox');
    await fireEvent.input(input, { target: { value: 'Draft a launch plan' } });
    const create = await within(dialog).findByText('Create “Draft a launch plan”');
    await fireEvent.click(create);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const item = create.closest('[data-command-item]') as HTMLElement;
    expect(item.getAttribute('aria-busy')).toBe('true');
    finish();
    commands.destroy();
  });

  it('keeps the dialog usable and shows an error when an async provider fails', async () => {
    const commands = createCommands({ session: fakeSession([]) }, []);
    commands.registerSearchSource(async () => {
      throw new Error('provider unavailable');
    });
    render(AppCommandPalette, { registry: commands });
    await fireEvent.keyDown(window, { key: 'k', ...mod() });
    const dialog = await screen.findByRole('dialog');
    await fireEvent.input(within(dialog).getByRole('combobox'), { target: { value: 'unknown' } });
    expect(await within(dialog).findByText('Search failed.')).toBeTruthy();
    expect(dialog.getAttribute('data-state')).toBe('open');
    commands.destroy();
  });
});

describe('ShortcutSheet', () => {
  it('groups accessible labels, formats chords for the platform, and filters inactive scopes', () => {
    render(ShortcutSheet, {
      props: {
        platform: 'mac',
        activeScopes: ['editor'],
        groupOrder: ['Editing', 'General'],
        bindings: [
          {
            id: 'save',
            label: 'Save changes',
            group: 'Editing',
            keys: ['mod+s'],
            scopes: ['editor'],
          },
          { id: 'help', label: 'Show help', group: 'General', keys: ['?'], scopes: ['global'] },
          { id: 'hidden', label: 'Canvas only', group: 'Canvas', keys: ['e'], scopes: ['canvas'] },
        ],
      },
    });

    const region = screen.getByRole('region', { name: 'Keyboard shortcuts' });
    expect(within(region).getByRole('heading', { name: 'Editing' })).toBeTruthy();
    expect(within(region).getByRole('heading', { name: 'General' })).toBeTruthy();
    expect(within(region).getByText('Save changes')).toBeTruthy();
    expect(within(region).getByText('⌘S')).toBeTruthy();
    expect(within(region).getByText('Show help')).toBeTruthy();
    expect(within(region).queryByText('Canvas only')).toBeNull();
  });

  it('filters visible shortcuts by label and chord with an announced empty state', async () => {
    render(ShortcutSheet, {
      props: {
        platform: 'other',
        bindings: [
          { id: 'save', label: 'Save changes', group: 'Editing', keys: ['mod+s'] },
          { id: 'help', label: 'Show help', group: 'General', keys: ['?'] },
        ],
      },
    });
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search shortcuts' }), {
      target: { value: 'ctrl+s' },
    });
    expect(screen.getByText('Save changes')).toBeTruthy();
    expect(screen.queryByText('Show help')).toBeNull();
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search shortcuts' }), {
      target: { value: 'not here' },
    });
    expect(screen.getByRole('status').textContent).toBe('No shortcuts found');
  });
});
