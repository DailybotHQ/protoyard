import { getContext, setContext } from 'svelte';

/**
 * Tiny API for chat/support widgets running inside the widget-host shell.
 * Prototypes use `getWidgetHost()` (context); tests and harnesses may also use
 * `window.__protoyardWidget`.
 */
export interface WidgetHostApi {
  /** Drive the launcher unread badge (0 hides it). */
  setUnread(count: number): void;
  getUnread(): number;
  /** Whether the anchored panel is open. */
  isOpen(): boolean;
  open(): void;
  close(): void;
}

const KEY = Symbol.for('protoyard.widget-host');

export function provideWidgetHost(api: WidgetHostApi): void {
  setContext(KEY, api);
}

/**
 * Context getter for prototypes (no direct `window` access required).
 * Throws when not mounted under the widget-host frame.
 */
export function getWidgetHost(): WidgetHostApi {
  let api: WidgetHostApi | undefined;
  try {
    api = getContext<WidgetHostApi | undefined>(KEY);
  } catch {
    api = undefined;
  }
  if (!api && typeof window !== 'undefined') {
    api = window.__protoyardWidget;
  }
  if (!api) {
    throw new Error(
      '[protoyard] getWidgetHost() is only available inside the widget-host shell frame.'
    );
  }
  return api;
}

/** Optional lookup that does not throw (for code that works in any shell). */
export function tryGetWidgetHost(): WidgetHostApi | null {
  try {
    return getWidgetHost();
  } catch {
    return null;
  }
}

declare global {
  interface Window {
    __protoyardWidget?: WidgetHostApi;
  }
}
