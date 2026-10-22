import type { SessionController } from '@protoyard/core';

export {
  filterHotkeyBindings,
  formatHotkeyChord,
  formatHotkeyKeys,
  type HotkeyBinding,
  type HotkeyPlatform,
  type HotkeyScope,
} from './hotkeys.ts';

/** A route-shaped record; route loaders are never called by the command engine. */
export interface RouteLike {
  path: string;
  name?: string;
  description?: string;
  capability?: string;
}

export interface CommandAction {
  id: string;
  label: string;
  group?: string;
  description?: string;
  keywords?: readonly string[];
  /** `mod+shift+n` style; `mod+k` and `mod+.` are reserved. */
  shortcut?: string;
  capability?: string;
  /** Only commands in an active scope are shown. Unscoped commands stay global. */
  scopes?: readonly string[];
  /** A command with children opens a nested selection step instead of running. */
  children?: readonly CommandEntry[] | ((signal: AbortSignal) => Promise<CommandEntry[]>);
  /** Usually a service call through `runService`; a returned promise shows pending feedback. */
  run?: () => unknown;
}

export interface RecentRecord {
  id: string;
  label: string;
  path: string;
  description?: string;
  capability?: string;
}

export type CommandKind = 'recent' | 'page' | 'action' | 'create';

export interface CommandEntry {
  id: string;
  kind: CommandKind;
  label: string;
  group: string;
  description?: string;
  keywords: readonly string[];
  shortcut?: string;
  path?: string;
  run?: () => unknown;
  capability?: string;
  scopes?: readonly string[];
  children?: readonly CommandEntry[] | ((signal: AbortSignal) => Promise<CommandEntry[]>);
}

export type CommandSearchSource = (query: string, signal: AbortSignal) => Promise<CommandEntry[]>;

export interface CommandRegistry {
  /** Every command the current persona and scope may use: recent, pages, actions. */
  list(): CommandEntry[];
  /** Applies the current capability and scope filters to an arbitrary step. */
  filter(entries: readonly CommandEntry[]): CommandEntry[];
  /** Ranked synchronous matches; an empty query retains the legacy list order. */
  search(query: string, limit?: number): CommandEntry[];
  /** Ranked local and registered async matches. A newer call aborts the prior search. */
  searchAsync(query: string, signal?: AbortSignal, limit?: number): Promise<CommandEntry[]>;
  /** Resolve a nested selection step, including lazy children. */
  children(entry: CommandEntry, signal?: AbortSignal): Promise<CommandEntry[]>;
  find(id: string): CommandEntry | undefined;
  /** Adds an action; returns a function that removes it. */
  register(action: CommandAction): () => void;
  /** Adds an abortable search provider; returns a function that removes it. */
  registerSearchSource(source: CommandSearchSource): () => void;
  /** Puts a record at the top of Recent (deduplicated by id, capped). */
  addRecent(record: RecentRecord): void;
  clearRecent(): void;
  /** Changes the active scopes, used to expose contextual commands. */
  setScopes(scopes: readonly string[]): void;
  /** Materializes the host's "create what I typed" fallback, when configured. */
  createFromQuery(query: string): CommandEntry | undefined;
  /** Runs an action, asserting its simulated capability first. */
  run(entry: CommandEntry): Promise<unknown>;
  /** The allowed action whose shortcut matches the key event, if any. */
  matchShortcut(event: KeyboardEvent, isMac: boolean): CommandEntry | undefined;
  subscribe(listener: () => void): () => void;
  destroy(): void;
}

export interface CreateCommandsOptions {
  maxRecent?: number;
  scopes?: readonly string[];
  createFallback?: (query: string) => CommandAction | undefined;
}

export const COMMAND_QUERY_MAX_LENGTH = 256;
export const COMMAND_RESULT_MAX = 100;

function boundedQuery(query: string): string {
  return query.slice(0, COMMAND_QUERY_MAX_LENGTH).trim();
}

function boundedCount(value: number, fallback: number, max: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(max, Math.trunc(value))) : fallback;
}

const RESERVED = new Set(['mod+k', 'mod+.']);
const KIND_ORDER: Record<CommandKind, number> = { recent: 0, page: 1, action: 2, create: 3 };

/** Normalizes `Mod+Shift+N` to `mod+shift+n` with modifiers in a fixed order. */
export function normalizeShortcut(shortcut: string): string {
  const parts = shortcut
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.filter((part) => !['mod', 'shift', 'alt'].includes(part));
  if (key.length !== 1) throw new RangeError(`shortcut "${shortcut}" needs exactly one key`);
  return [...['mod', 'shift', 'alt'].filter((modifier) => parts.includes(modifier)), key[0]].join(
    '+'
  );
}

/** The normalized shortcut of a key event, or null when it has no key. */
export function eventShortcut(event: KeyboardEvent, isMac: boolean): string | null {
  const key = event.key.toLowerCase();
  if (['meta', 'control', 'shift', 'alt'].includes(key)) return null;
  const parts: string[] = [];
  if (isMac ? event.metaKey : event.ctrlKey) parts.push('mod');
  if (event.shiftKey) parts.push('shift');
  if (event.altKey) parts.push('alt');
  parts.push(key);
  return parts.join('+');
}

/** Subsequence score with word-start and contiguous-match bonuses. */
export function scoreCommand(entry: CommandEntry, rawQuery: string): number {
  const query = boundedQuery(rawQuery).toLowerCase();
  if (!query) return 1;
  const label = entry.label.toLowerCase();
  if (label.startsWith(query)) return 400 + query.length;
  if (label.split(/[\s\-_/.]+/).some((word) => word.startsWith(query))) return 300 + query.length;
  if (label.includes(query)) return 200 + query.length;

  const extras = [entry.description ?? '', ...entry.keywords].map((value) => value.toLowerCase());
  if (extras.some((value) => value.includes(query))) return 100 + query.length;

  let at = 0;
  let contiguous = 0;
  let matched = 0;
  for (let index = 0; index < label.length && at < query.length; index += 1) {
    if (label[index] !== query[at]) continue;
    matched += 1;
    if (index === 0 || /[\s\-_/.]/.test(label[index - 1] ?? '')) contiguous += 2;
    if (label[index - 1] === query[at - 1]) contiguous += 3;
    at += 1;
  }
  return matched === query.length ? 20 + contiguous - label.length / 100 : 0;
}

function routeEntries(routes: readonly RouteLike[]): CommandEntry[] {
  return routes
    .filter((route) => route.name && !route.path.includes(':') && !route.path.includes('*'))
    .map((route) => ({
      id: `page:${route.path}`,
      kind: 'page',
      label: route.name as string,
      group: 'Pages',
      ...(route.description ? { description: route.description } : {}),
      keywords: [route.path],
      path: route.path,
      ...(route.capability ? { capability: route.capability } : {}),
    }));
}

function rank(entries: readonly CommandEntry[], query: string, limit: number): CommandEntry[] {
  const normalized = boundedQuery(query);
  if (!normalized) return [...entries].slice(0, limit);
  return entries
    .map((entry) => ({ entry, score: scoreCommand(entry, normalized) }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        KIND_ORDER[left.entry.kind] - KIND_ORDER[right.entry.kind] ||
        (left.entry.label < right.entry.label
          ? -1
          : left.entry.label > right.entry.label
            ? 1
            : 0) ||
        (left.entry.id < right.entry.id ? -1 : left.entry.id > right.entry.id ? 1 : 0)
    )
    .slice(0, limit)
    .map(({ entry }) => entry);
}

/** Rank any command step with the same stable rules as the root palette. */
export function rankCommands(
  entries: readonly CommandEntry[],
  query: string,
  limit = COMMAND_RESULT_MAX
): CommandEntry[] {
  return rank(entries, query, boundedCount(limit, COMMAND_RESULT_MAX, COMMAND_RESULT_MAX));
}

function abortError(): DOMException {
  return new DOMException('Command search was superseded', 'AbortError');
}

export function createCommands(
  runtime: { session: Pick<SessionController, 'can' | 'assert' | 'subscribe'> },
  routes: readonly RouteLike[],
  options: CreateCommandsOptions = {}
): CommandRegistry {
  const pages = routeEntries(routes);
  const actions = new Map<string, CommandEntry>();
  const searchSources = new Set<CommandSearchSource>();
  const listeners = new Set<() => void>();
  let recent: CommandEntry[] = [];
  let scopes = new Set(options.scopes ?? []);
  let activeSearch: AbortController | undefined;
  const maxRecent = boundedCount(options.maxRecent ?? 8, 8, 50);
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const allowed = (entry: CommandEntry) =>
    (!entry.capability || runtime.session.can(entry.capability)) &&
    (!entry.scopes?.length || entry.scopes.some((scope) => scopes.has(scope)));
  const visible = (entries: readonly CommandEntry[]) => entries.filter(allowed);
  const stopSession = runtime.session.subscribe(notify);

  const registry: CommandRegistry = {
    list() {
      return visible([...recent, ...pages, ...actions.values()]);
    },
    filter(entries) {
      return visible(entries);
    },
    search(query, limit = 50) {
      const safeLimit = boundedCount(limit, 50, COMMAND_RESULT_MAX);
      return rank(registry.list(), query, safeLimit);
    },
    async searchAsync(query, signal, limit = 50) {
      activeSearch?.abort();
      const controller = new AbortController();
      activeSearch = controller;
      const abortFromCaller = () => controller.abort();
      if (signal?.aborted) controller.abort();
      signal?.addEventListener('abort', abortFromCaller, { once: true });
      const safeQuery = boundedQuery(query);
      const safeLimit = boundedCount(limit, 50, COMMAND_RESULT_MAX);
      try {
        if (controller.signal.aborted) throw abortError();
        const local = registry.list();
        let remote: CommandEntry[][];
        try {
          remote = await Promise.all(
            [...searchSources].map((source) => source(safeQuery, controller.signal))
          );
        } catch (error) {
          controller.abort();
          throw error;
        }
        if (controller.signal.aborted) throw abortError();
        const unique = new Map<string, CommandEntry>();
        for (const entry of [...local, ...remote.flat()]) {
          if (allowed(entry) && !unique.has(entry.id)) unique.set(entry.id, entry);
        }
        const results = rank([...unique.values()], safeQuery, safeLimit);
        const fallback = registry.createFromQuery(safeQuery);
        if (fallback && results.length === 0 && allowed(fallback)) {
          return [...results, fallback].slice(0, safeLimit);
        }
        return results;
      } finally {
        signal?.removeEventListener('abort', abortFromCaller);
        if (activeSearch === controller) activeSearch = undefined;
      }
    },
    async children(entry, signal) {
      if (!allowed(entry)) {
        if (entry.capability) runtime.session.assert(entry.capability);
        throw new Error('Command is unavailable in the current scope');
      }
      if (!entry.children) return [];
      if (signal?.aborted) throw abortError();
      const entries =
        typeof entry.children === 'function'
          ? await entry.children(signal ?? new AbortController().signal)
          : entry.children;
      if (signal?.aborted) throw abortError();
      return visible(entries);
    },
    find(id) {
      return registry.list().find((entry) => entry.id === id);
    },
    register(action) {
      const shortcut = action.shortcut ? normalizeShortcut(action.shortcut) : undefined;
      if (shortcut && RESERVED.has(shortcut)) {
        throw new RangeError(`${shortcut} is reserved (the palette uses mod+k, DevTools mod+.)`);
      }
      const id = `action:${action.id}`;
      actions.set(id, {
        id,
        kind: 'action',
        label: action.label,
        group: action.group ?? 'Actions',
        ...(action.description ? { description: action.description } : {}),
        keywords: action.keywords ?? [],
        ...(shortcut ? { shortcut } : {}),
        ...(action.scopes?.length ? { scopes: [...action.scopes] } : {}),
        ...(action.children ? { children: action.children } : {}),
        ...(action.run ? { run: action.run } : {}),
        ...(action.capability ? { capability: action.capability } : {}),
      });
      notify();
      return () => {
        if (actions.delete(id)) notify();
      };
    },
    registerSearchSource(source) {
      searchSources.add(source);
      notify();
      return () => {
        if (searchSources.delete(source)) notify();
      };
    },
    addRecent(record) {
      const id = `recent:${record.id}`;
      const entry: CommandEntry = {
        id,
        kind: 'recent',
        label: record.label,
        group: 'Recent',
        ...(record.description ? { description: record.description } : {}),
        keywords: [record.path],
        path: record.path,
        ...(record.capability ? { capability: record.capability } : {}),
      };
      recent = [entry, ...recent.filter((other) => other.id !== id)].slice(0, maxRecent);
      notify();
    },
    clearRecent() {
      recent = [];
      notify();
    },
    setScopes(next) {
      scopes = new Set(next);
      notify();
    },
    createFromQuery(query) {
      const safeQuery = boundedQuery(query);
      if (!safeQuery || !options.createFallback) return undefined;
      const action = options.createFallback(safeQuery);
      if (!action) return undefined;
      return {
        id: `create:${safeQuery.toLowerCase()}`,
        kind: 'create',
        label: action.label,
        group: action.group ?? 'Create',
        description: action.description,
        keywords: action.keywords ?? [],
        run: action.run,
        ...(action.capability ? { capability: action.capability } : {}),
        ...(action.scopes?.length ? { scopes: [...action.scopes] } : {}),
      };
    },
    async run(entry) {
      if (!allowed(entry)) {
        if (entry.capability) runtime.session.assert(entry.capability);
        throw new Error('Command is unavailable in the current scope');
      }
      if (entry.capability) runtime.session.assert(entry.capability);
      return entry.run?.();
    },
    matchShortcut(event, isMac) {
      const pressed = eventShortcut(event, isMac);
      if (!pressed) return undefined;
      return [...actions.values()].find((entry) => entry.shortcut === pressed && allowed(entry));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      activeSearch?.abort();
      stopSession();
      listeners.clear();
      searchSources.clear();
    },
  };
  return registry;
}
