import type { SessionController } from '@protoyard/core';

/**
 * The command list behind the app palette: pages from route metadata, actions
 * the app registers, and recent records. Framework-free, so it can live in the
 * small static part while the palette dialog loads lazily. Everything is
 * filtered by capability through the session (simulated policy: UX, not
 * security; services still assert) and re-filtered on persona switches.
 */

/** Route metadata as `defineRoutes` declares it. Only these fields are read; `load` is never called. */
export interface RouteLike {
  path: string;
  name?: string;
  description?: string;
  capability?: string;
}

export interface CommandAction {
  id: string;
  label: string;
  /** Group heading (default "Actions"). */
  group?: string;
  description?: string;
  keywords?: readonly string[];
  /** `mod+shift+n` style: `mod` is ⌘ on Mac and Ctrl elsewhere. `mod+k` and `mod+.` are reserved. */
  shortcut?: string;
  capability?: string;
  /** Usually a service call through `runService`; a returned promise shows pending feedback. */
  run: () => unknown;
}

export interface RecentRecord {
  id: string;
  label: string;
  /** Hash route to open, e.g. `/deals/d_042`. */
  path: string;
  description?: string;
  capability?: string;
}

export type CommandKind = 'recent' | 'page' | 'action';

export interface CommandEntry {
  id: string;
  kind: CommandKind;
  label: string;
  group: string;
  description?: string;
  keywords: readonly string[];
  shortcut?: string;
  /** Pages and recent records navigate here. */
  path?: string;
  /** Actions run this. */
  run?: () => unknown;
  capability?: string;
}

export interface CommandRegistry {
  /** Every command the current persona may use: recent, then pages, then actions. */
  list(): CommandEntry[];
  /** Ranked matches for `query` (an empty query returns `list()`). */
  search(query: string, limit?: number): CommandEntry[];
  find(id: string): CommandEntry | undefined;
  /** Adds an action; returns a function that removes it. */
  register(action: CommandAction): () => void;
  /** Puts a record at the top of "Recent" (deduplicated by id, capped). */
  addRecent(record: RecentRecord): void;
  clearRecent(): void;
  /**
   * Runs an action, asserting its capability first (the denial is a real
   * `PermissionDeniedError`, so `runService` shows its "Not allowed" toast).
   */
  run(entry: CommandEntry): Promise<unknown>;
  /** The allowed action whose shortcut matches the key event, if any. */
  matchShortcut(event: KeyboardEvent, isMac: boolean): CommandEntry | undefined;
  /** Called when the list may have changed (registration, recents, persona switch). */
  subscribe(listener: () => void): () => void;
  destroy(): void;
}

const RESERVED = new Set(['mod+k', 'mod+.']);
const KIND_ORDER: Record<CommandKind, number> = { recent: 0, page: 1, action: 2 };

/** Normalizes `Mod+Shift+N` to `mod+shift+n` with modifiers in a fixed order. */
export function normalizeShortcut(shortcut: string): string {
  const parts = shortcut
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.filter((part) => !['mod', 'shift', 'alt'].includes(part));
  if (key.length !== 1) throw new RangeError(`shortcut "${shortcut}" needs exactly one key`);
  return [...['mod', 'shift', 'alt'].filter((m) => parts.includes(m)), key[0]].join('+');
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

function routeEntries(routes: readonly RouteLike[]): CommandEntry[] {
  return (
    routes
      // Parameter and wildcard routes need an id: recent records cover those.
      .filter((route) => route.name && !route.path.includes(':') && !route.path.includes('*'))
      .map((route) => ({
        id: `page:${route.path}`,
        kind: 'page' as const,
        label: route.name as string,
        group: 'Pages',
        ...(route.description ? { description: route.description } : {}),
        keywords: [route.path],
        path: route.path,
        ...(route.capability ? { capability: route.capability } : {}),
      }))
  );
}

function score(entry: CommandEntry, query: string): number {
  const label = entry.label.toLowerCase();
  if (label.startsWith(query)) return 4;
  if (label.split(/\s+/).some((word) => word.startsWith(query))) return 3;
  if (label.includes(query)) return 2;
  const extra = [entry.description ?? '', ...entry.keywords].join(' ').toLowerCase();
  return extra.includes(query) ? 1 : 0;
}

export function createCommands(
  runtime: { session: Pick<SessionController, 'can' | 'assert' | 'subscribe'> },
  routes: readonly RouteLike[],
  options: { maxRecent?: number } = {}
): CommandRegistry {
  const pages = routeEntries(routes);
  const actions = new Map<string, CommandEntry>();
  let recent: CommandEntry[] = [];
  const listeners = new Set<() => void>();
  const maxRecent = options.maxRecent ?? 8;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const allowed = (entry: CommandEntry) =>
    !entry.capability || runtime.session.can(entry.capability);
  const stopSession = runtime.session.subscribe(notify);

  const registry: CommandRegistry = {
    list() {
      return [...recent, ...pages, ...actions.values()].filter(allowed);
    },
    search(query, limit = 50) {
      const q = query.trim().toLowerCase();
      if (!q) return registry.list().slice(0, limit);
      return registry
        .list()
        .map((entry) => ({ entry, rank: score(entry, q) }))
        .filter(({ rank }) => rank > 0)
        .sort(
          (a, b) =>
            b.rank - a.rank ||
            KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind] ||
            (a.entry.label < b.entry.label ? -1 : a.entry.label > b.entry.label ? 1 : 0)
        )
        .slice(0, limit)
        .map(({ entry }) => entry);
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
        run: action.run,
        ...(action.capability ? { capability: action.capability } : {}),
      });
      notify();
      return () => {
        if (actions.delete(id)) notify();
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
    async run(entry) {
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
      stopSession();
      listeners.clear();
    },
  };
  return registry;
}
