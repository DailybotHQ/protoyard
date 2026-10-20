import type { AlertDialog, DropdownMenu, Popover } from '@protoyard/ui';

/*
 * Menus, popovers and dialogs pull in Bits UI's floating, focus and dismiss
 * layers (about 30 KB gzip). Views show them only on demand ("Move to…",
 * "+N more", a column menu, a confirmation), so each loads on first use from
 * its own chunk, shared by every view. Triggers prefetch on hover or focus,
 * so the first click usually opens at once.
 */

export interface LazyComponent<T> {
  /** The loaded component, or null until `load()` resolves. */
  readonly current: T | null;
  load(): Promise<T>;
}

function lazy<T>(importer: () => Promise<T>): LazyComponent<T> {
  let value = $state.raw<T | null>(null);
  let pending: Promise<T> | null = null;
  return {
    get current() {
      return value;
    },
    load() {
      pending ??= importer().then(
        (loaded) => (value = loaded),
        (error: unknown) => {
          // Let a later attempt retry (offline, a failed chunk request).
          pending = null;
          throw error;
        }
      );
      return pending;
    },
  };
}

export const lazyMenu: LazyComponent<typeof DropdownMenu> = lazy(() =>
  import('./overlays/menu.ts').then((m) => m.DropdownMenu)
);
export const lazyPopover: LazyComponent<typeof Popover> = lazy(() =>
  import('./overlays/popover.ts').then((m) => m.Popover)
);
export const lazyDialog: LazyComponent<typeof AlertDialog> = lazy(() =>
  import('./overlays/dialog.ts').then((m) => m.AlertDialog)
);
