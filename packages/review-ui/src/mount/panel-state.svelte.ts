import type { ReviewPanelProps } from '../panel/types.ts';

/**
 * The comments panel's props as one reactive object, shared by the session
 * (which keeps it current) and whichever host shows the panel: the session's
 * own floating panel, or the DevTools "Comments" tab, which spreads it.
 */
export function createPanelState(): ReviewPanelProps {
  const state = $state<ReviewPanelProps>({ comments: [] });
  return state;
}
