import type { WidgetHostApi } from '@protoyard/renderer-svelte';

/**
 * Stand-in for the widget-host frame: `open` is `$state`, like the real
 * frame's, so the app's effects see the panel open and close.
 */
export class FakeWidgetHost implements WidgetHostApi {
  opened = $state(false);
  unread = $state(0);
  setUnread(count: number): void {
    this.unread = Math.max(0, Math.floor(count));
  }
  getUnread(): number {
    return this.unread;
  }
  isOpen(): boolean {
    return this.opened;
  }
  open(): void {
    this.opened = true;
  }
  close(): void {
    this.opened = false;
  }
}
