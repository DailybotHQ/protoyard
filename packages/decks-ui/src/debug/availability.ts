/**
 * Whether the deck's "Debug for agents" panel is available. Tiny on purpose:
 * DeckApp imports this file directly, and the panel itself stays on its own
 * lazy chunk (`./index.ts`) that loads only when it opens.
 */

/** `auto` (the default): dev builds or `?debug=1`. `on` and `off` are the host's choice. */
export type DeckDebugSetting = 'auto' | 'on' | 'off';

export interface DeckDebugContext {
  /** True in a Vite dev server build. */
  dev?: boolean;
  /** The page's `location.search`. */
  search?: string;
}

/** True for a Vite dev build (`import.meta.env.DEV`); false in production builds and exports. */
export function isDevBuild(): boolean {
  return (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
}

/** `?debug=1` (or `true`) on the page URL. */
export function debugQueryOn(search: string): boolean {
  try {
    const value = new URLSearchParams(search).get('debug');
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}

/** The availability matrix: `off` always wins, `on` always shows, `auto` needs dev or `?debug=1`. */
export function deckDebugAvailable(
  setting: DeckDebugSetting = 'auto',
  context: DeckDebugContext = {}
): boolean {
  if (setting === 'off') return false;
  if (setting === 'on') return true;
  return context.dev === true || debugQueryOn(context.search ?? '');
}
