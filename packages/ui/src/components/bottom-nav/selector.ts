/**
 * Every pinned phone tab bar a prototype can render: this package's
 * BottomNav (`data-py-bottom-nav`), Texuli's BottomNav (`data-tx-bottom-nav`)
 * and the tab bar of Texuli's `mobile-tabs` layout (`data-tx-mobile-tabs`),
 * which LayoutHost renders. Floating UI (DevTools, the review toolbar, badges)
 * keeps clear of whichever is on screen.
 */
export const BOTTOM_NAV_SELECTOR =
  '[data-py-bottom-nav], [data-tx-bottom-nav], [data-tx-mobile-tabs]';
