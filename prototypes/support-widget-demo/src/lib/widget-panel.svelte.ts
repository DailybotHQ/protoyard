import { tryGetWidgetHost, type WidgetHostApi } from '@protoyard/renderer-svelte';

/**
 * Whether the visitor can see the thread right now.
 *
 * In the widget-host shell that means "the panel is open". The host's
 * `isOpen()` reads the frame's `$state`, so an `$effect` that reads `viewing`
 * re-runs when the launcher opens or closes the panel. The frame is loaded
 * lazily and can mount after the app; until it does, the panel counts as
 * closed when the prototype expects the widget-host shell (it starts closed),
 * and as open otherwise (the app is the whole page). `watch()` picks the host
 * up as soon as the frame marks the panel.
 */
export class WidgetPanel {
  #host = $state.raw<WidgetHostApi | null>(null);
  readonly #expectsHost: boolean;

  constructor(expectsHost: boolean) {
    this.#expectsHost = expectsHost;
    this.#host = tryGetWidgetHost();
  }

  get host(): WidgetHostApi | null {
    return this.#host;
  }

  get viewing(): boolean {
    const host = this.#host;
    return host ? host.isOpen() : !this.#expectsHost;
  }

  /** Watches for a frame that mounts after the app. Returns the cleanup. */
  watch(): () => void {
    if (this.#host || typeof MutationObserver === 'undefined' || typeof document === 'undefined')
      return () => {};
    const observer = new MutationObserver(() => {
      const host = tryGetWidgetHost();
      if (!host) return;
      this.#host = host;
      observer.disconnect();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-py-widget-panel', 'data-py-shell'],
    });
    return () => observer.disconnect();
  }
}
