/**
 * `@protoyard/decks-ui` overview grid — lazy surface for the O key.
 * Import only when the overview opens so layout thumbnails stay out of the
 * first paint of DeckApp.
 */
export { default as DeckOverview } from './DeckOverview.svelte';
export {
  isOverviewNavKey,
  moveOverviewSelection,
  OVERVIEW_BREAKPOINTS,
  OVERVIEW_WINDOW_RADIUS,
  overviewColumns,
  overviewWindow,
} from './window.ts';
