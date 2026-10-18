import type { Snippet } from 'svelte';
import { getContext, setContext } from 'svelte';

const KEY = Symbol('lumen-shell-layout');

/**
 * Lets a screen publish a primary-action strip into MobileAppShell's
 * `stickyFooter` (above BottomNav, outside the scrolling main).
 */
export interface ShellLayout {
  readonly footer: Snippet | null;
  setFooter(footer: Snippet | null): void;
}

export function provideShellLayout(): ShellLayout {
  let footer = $state.raw<Snippet | null>(null);
  const layout: ShellLayout = {
    get footer() {
      return footer;
    },
    setFooter(next) {
      footer = next;
    },
  };
  setContext(KEY, layout);
  return layout;
}

/** Present when App (or a test host) wraps screens in MobileAppShell. */
export function useShellLayout(): ShellLayout | null {
  return getContext<ShellLayout | undefined>(KEY) ?? null;
}
