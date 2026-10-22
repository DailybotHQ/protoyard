// @vitest-environment node
import { PermissionDeniedError, type Principal } from '@protoyard/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMMAND_QUERY_MAX_LENGTH,
  type CommandEntry,
  createCommands,
  filterHotkeyBindings,
  formatHotkeyChord,
  formatHotkeyKeys,
  normalizeShortcut,
  type RouteLike,
  scoreCommand,
} from '../src/commands/index.ts';

describe('hotkey bindings', () => {
  const bindings = [
    { id: 'save', label: 'Save', group: 'General', keys: ['mod+s'], scopes: ['editor'] },
    { id: 'help', label: 'Help', group: 'General', keys: ['?'], scopes: ['global'] },
    { id: 'search', label: 'Search', group: 'General', keys: ['g s', 'mod+k'] },
    { id: 'hidden', label: 'Hidden', group: 'Editor', keys: ['e'], scopes: ['canvas'] },
  ] as const;

  it('formats platform chords and multi-key sequences without browser state', () => {
    expect(formatHotkeyChord('mod+shift+n', 'mac')).toBe('⌘⇧N');
    expect(formatHotkeyChord('mod+shift+n', 'other')).toBe('Ctrl+Shift+N');
    expect(formatHotkeyChord('arrowleft', 'other')).toBe('←');
    expect(formatHotkeyKeys(bindings[2], 'other')).toEqual(['G then S', 'Ctrl+K']);
    expect(() => formatHotkeyChord('mod+shift', 'mac')).toThrow(RangeError);
    expect(() => formatHotkeyKeys({ keys: [''] }, 'mac')).toThrow(RangeError);
  });

  it('filters scoped bindings and always includes global and unscoped shortcuts', () => {
    expect(filterHotkeyBindings(bindings, ['editor']).map(({ id }) => id)).toEqual([
      'save',
      'help',
      'search',
    ]);
    expect(filterHotkeyBindings(bindings).map(({ id }) => id)).toEqual([
      'save',
      'help',
      'search',
      'hidden',
    ]);
  });
});

function fakeSession(initial: string[] = []) {
  let capabilities = new Set(initial);
  const listeners = new Set<(principal: Principal | null) => void>();
  return {
    can: (capability: string) => capabilities.has(capability),
    assert: (capability: string) => {
      if (!capabilities.has(capability)) throw new PermissionDeniedError(capability, 'viewer');
    },
    subscribe: (listener: (principal: Principal | null) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    switchPersona(next: string[]) {
      capabilities = new Set(next);
      for (const listener of listeners) listener(null);
    },
  };
}

const ROUTES: RouteLike[] = [
  { path: '/', name: 'Dashboard' },
  { path: '/projects', name: 'Projects', capability: 'projects:read' },
  { path: '/projects/:id', name: 'Project details' },
];

const ids = (entries: CommandEntry[]) => entries.map(({ id }) => id);
const registries: Array<ReturnType<typeof createCommands>> = [];
const makeCommands = (...args: Parameters<typeof createCommands>) => {
  const commands = createCommands(...args);
  registries.push(commands);
  return commands;
};

afterEach(() => {
  for (const registry of registries.splice(0)) registry.destroy();
});

describe('command engine', () => {
  it('preserves route and action APIs while ranking subsequence matches deterministically', () => {
    const commands = makeCommands({ session: fakeSession(['projects:read']) }, ROUTES);
    commands.register({
      id: 'new-project',
      label: 'Create project',
      keywords: ['workspace'],
      run: vi.fn(),
    });
    expect(ids(commands.list())).toEqual(['page:/', 'page:/projects', 'action:new-project']);
    expect(ids(commands.search('prj'))).toContain('page:/projects');
    expect(scoreCommand(commands.find('action:new-project')!, 'workspace')).toBeGreaterThan(0);
    expect(normalizeShortcut('Shift+Mod+P')).toBe('mod+shift+p');
    expect(commands.search('x'.repeat(COMMAND_QUERY_MAX_LENGTH + 10))).toEqual([]);
  });

  it('ranks bounded async results, filters capabilities and appends the create fallback', async () => {
    const run = vi.fn();
    const commands = makeCommands({ session: fakeSession([]) }, [], {
      createFallback: (query) => ({ id: 'create', label: `Create “${query}”`, run }),
    });
    const unregister = commands.registerSearchSource(async (query, signal) => {
      expect(signal.aborted).toBe(false);
      if (query !== 'orchid') return [];
      return [
        {
          id: 'search:orchid',
          kind: 'page',
          label: 'Orchid project',
          group: 'Search',
          keywords: [],
        },
        {
          id: 'search:hidden',
          kind: 'page',
          label: 'Orchid confidential',
          group: 'Search',
          keywords: [],
          capability: 'private:read',
        },
      ];
    });
    expect(ids(await commands.searchAsync('orchid'))).toEqual(['search:orchid']);
    expect(ids(await commands.searchAsync('spruce'))).toEqual(['create:spruce']);
    unregister();
    expect(ids(await commands.searchAsync('orchid'))).toEqual(['create:orchid']);
  });

  it('aborts a superseded async search and removes the old result', async () => {
    const commands = makeCommands({ session: fakeSession() }, []);
    let firstSignal: AbortSignal | undefined;
    commands.registerSearchSource((query, signal) => {
      if (query === 'old') {
        firstSignal = signal;
        return new Promise<CommandEntry[]>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      }
      return Promise.resolve([
        { id: 'new-result', kind: 'page', label: 'New result', group: 'Search', keywords: [] },
      ]);
    });
    const stale = commands.searchAsync('old');
    const current = commands.searchAsync('new');
    await expect(stale).rejects.toMatchObject({ name: 'AbortError' });
    expect(firstSignal?.aborted).toBe(true);
    expect(ids(await current)).toEqual(['new-result']);
  });

  it('does not invoke providers for a caller signal that is already aborted', async () => {
    const commands = makeCommands({ session: fakeSession() }, []);
    const source = vi.fn(async (_query: string): Promise<CommandEntry[]> => []);
    commands.registerSearchSource(source);
    const controller = new AbortController();
    controller.abort();
    await expect(commands.searchAsync('query', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(source).not.toHaveBeenCalled();
  });

  it('bounds query text before calling async search providers', async () => {
    const commands = makeCommands({ session: fakeSession() }, []);
    const source = vi.fn(async (_query: string): Promise<CommandEntry[]> => []);
    commands.registerSearchSource(source);
    await commands.searchAsync('z'.repeat(COMMAND_QUERY_MAX_LENGTH + 20));
    expect(source.mock.calls[0]?.[0]).toHaveLength(COMMAND_QUERY_MAX_LENGTH);
  });

  it('supports nested lazy steps, scope filtering and recent records', async () => {
    const session = fakeSession(['archive:run']);
    const commands = makeCommands({ session }, [], { scopes: ['project'] });
    const leaf = {
      id: 'action:archive',
      kind: 'action' as const,
      label: 'Archive',
      group: 'Project',
      keywords: [],
      run: vi.fn(),
    };
    const parent = commands.register({
      id: 'project-menu',
      label: 'Project actions',
      scopes: ['project'],
      children: async (signal) => {
        expect(signal.aborted).toBe(false);
        return [{ ...leaf, capability: 'archive:run' }];
      },
    });
    commands.register({ id: 'global', label: 'Global action', run: vi.fn() });
    expect(ids(commands.list())).toEqual(['action:project-menu', 'action:global']);
    const children = await commands.children(commands.find('action:project-menu')!);
    expect(ids(children)).toEqual(['action:archive']);
    session.switchPersona([]);
    expect(commands.filter(children)).toEqual([]);
    commands.setScopes(['settings']);
    expect(ids(commands.list())).toEqual(['action:global']);
    commands.addRecent({ id: 'r1', label: 'Orchid', path: '/orchid' });
    expect(ids(commands.search('orch'))[0]).toBe('recent:r1');
    parent();
  });

  it('asserts capabilities again at execution time after persona changes', async () => {
    const session = fakeSession(['projects:create']);
    const run = vi.fn();
    const commands = makeCommands({ session }, []);
    commands.register({
      id: 'create-project',
      label: 'Create project',
      capability: 'projects:create',
      run,
    });
    const entry = commands.find('action:create-project')!;
    session.switchPersona([]);
    await expect(commands.run(entry)).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(run).not.toHaveBeenCalled();
  });
});
