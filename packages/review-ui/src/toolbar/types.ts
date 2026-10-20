import type { ReviewAdapterInfo } from '@protoyard/review/store';

/** Optional HTTP-specific pending methods are consumed without requiring HTTP storage. */
export interface ReviewToolbarAdapter {
  info(): ReviewAdapterInfo;
  pendingCount?(): number;
  subscribePending?(onChange: () => void): () => void;
}

/**
 * Places the toolbar (the renderer passes its floating-chrome placement, which
 * shares the demo badge's rules). `handle` returns the launcher, the part that
 * is always shown; the toolbar grows away from its corner.
 */
export type ReviewToolbarPlacer = (
  element: HTMLElement,
  options: { handle: () => HTMLElement | null }
) => { update(): void; destroy(): void };

export interface ReviewToolbarProps {
  adapter: ReviewToolbarAdapter;
  count: number;
  commentMode?: boolean;
  panelOpen?: boolean;
  onCommentModeChange?: (active: boolean) => void | Promise<void>;
  onPanelChange?: (open: boolean) => void | Promise<void>;
  onExport?: () => void | Promise<void>;
  onImport?: (json: string) => void | Promise<void>;
  /** Hide the "Comments" button when another host (DevTools) shows the comments panel. */
  showPanelButton?: boolean;
  /** Where the toolbar sits; without it, the bottom-right corner. */
  place?: ReviewToolbarPlacer;
  /** Start expanded (default: only the launcher, so nothing covers the app). */
  expanded?: boolean;
}
