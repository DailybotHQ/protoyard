import type { ReviewAdapterInfo } from '@protoyard/review/store';

/** Optional HTTP-specific pending methods are consumed without requiring HTTP storage. */
export interface ReviewToolbarAdapter {
  info(): ReviewAdapterInfo;
  pendingCount?(): number;
  subscribePending?(onChange: () => void): () => void;
}

export interface ReviewToolbarProps {
  adapter: ReviewToolbarAdapter;
  count: number;
  commentMode?: boolean;
  panelOpen?: boolean;
  onCommentModeChange?: (active: boolean) => void | Promise<void>;
  onPanelChange?: (open: boolean) => void | Promise<void>;
  onExport?: () => void | Promise<void>;
  onImport?: (json: string) => void | Promise<void>;
}
