/**
 * `@protoyard/decks/layouts` — typed layout catalog for agents, lint and UI.
 */
export {
  bigStat,
  chart,
  closingCta,
  codeWithCallout,
  comparisonTable,
  DECK_LAYOUT_BY_ID,
  DECK_LAYOUT_IDS,
  DECK_LAYOUTS,
  type DeckLayoutId,
  describeLayouts,
  free,
  getDeckLayout,
  imageCentered,
  imageFullBleed,
  imageLeft,
  imageRight,
  type LayoutPropsIssue,
  parseLayoutProps,
  processSteps,
  quote,
  sectionDivider,
  teamAvatars,
  threeColumnCards,
  timeline,
  titleHero,
  twoColumnSplit,
  videoCentered,
  videoLeft,
  videoRight,
} from './catalog.ts';
export * from './props.ts';
export {
  DECK_LAYOUT_STEPPABLE,
  isSteppablePropPath,
  stepMarkersOutsideLayout,
  steppablePattern,
} from './steppable.ts';
export {
  type DeckLayoutEntry,
  LAYOUT_PACING,
  type LayoutLimits,
  type LayoutPacing,
} from './types.ts';
