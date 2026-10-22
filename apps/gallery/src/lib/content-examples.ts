/**
 * The deck, page and doc examples the home page and /features/ show: each one
 * opens in the hosted player from a share link built at static-build time,
 * with a cover captured from the real player (`pnpm covers`, written to
 * public/examples/<name>.png). Data only, so tests can hold each entry to its
 * blueprint file.
 */

export type ContentKind = 'deck' | 'page' | 'doc';

export interface ContentExample {
  kind: ContentKind;
  /** The blueprint file under blueprints/ (also the cover's name). */
  name: string;
  /** What it is for, in a few words. */
  useCase: string;
  /** What it shows off, in one line. */
  highlights: string;
  /** The generated prototype that renders the same blueprint, when there is one. */
  prototype?: string;
}

export const CONTENT_EXAMPLES: readonly ContentExample[] = [
  {
    kind: 'deck',
    name: 'protoyard-create-anything',
    useCase: 'Flagship deck',
    highlights:
      'Every layout family, live charts with a data table, an explorable chart, a poll, a what-if calculator, a quiz and an app embedded in a slide.',
    prototype: 'create-anything-deck',
  },
  {
    kind: 'deck',
    name: 'harbor-ops-pitch',
    useCase: 'Pitch',
    highlights: 'Process steps, a comparison table and a bar chart.',
  },
  {
    kind: 'deck',
    name: 'northwind-qbr',
    useCase: 'Quarterly review',
    highlights: 'A big stat, a funnel chart, a comparison and a live poll.',
  },
  {
    kind: 'deck',
    name: 'lumen-launch',
    useCase: 'Product launch',
    highlights: 'A process, three cards and a quiz.',
  },
  {
    kind: 'deck',
    name: 'cedar-training',
    useCase: 'Internal training',
    highlights: 'A timeline, a counter, a poll and a code callout.',
  },
  {
    kind: 'page',
    name: 'tidewater-roasters-landing',
    useCase: 'Coffee subscription',
    highlights:
      'A hero, proof stats, pricing plans, how it works and a waitlist form that stores responses.',
  },
  {
    kind: 'doc',
    name: 'northwind-quarterly-report',
    useCase: 'Quarterly report',
    highlights: 'A summary, headline numbers, a ticket chart and a table of contents.',
  },
];

/** The blueprint file of an example, relative to the repository root. */
export function contentExamplePath(example: ContentExample): string {
  return `blueprints/${example.kind}s/${example.name}.json`;
}

/** The cover image, under the site's public/ folder. */
export function contentExampleCover(example: ContentExample): string {
  return `/examples/${example.name}.png`;
}

export interface FlagshipSlide {
  /** The slide id in blueprints/decks/protoyard-create-anything.json. */
  id: string;
  /** The step the capture shows (the last one, so every fragment is revealed). */
  step: number;
  caption: string;
}

/** Slides of the flagship deck the site shows as stills, each a capability. */
export const FLAGSHIP_SLIDES: readonly FlagshipSlide[] = [
  { id: 'kinds', step: 0, caption: 'Four kinds from one JSON format: app, deck, page and doc' },
  { id: 'chart', step: 0, caption: 'Live charts with an accessible data table' },
  { id: 'explore', step: 0, caption: 'An explorable chart the audience can filter' },
  { id: 'poll', step: 0, caption: 'A live poll that counts votes in the browser' },
  { id: 'calculator', step: 0, caption: 'A what-if calculator from a closed formula' },
  { id: 'embed', step: 0, caption: 'A working app embedded in a slide' },
];

/** A flagship slide's still, under the site's public/ folder. */
export function flagshipSlideCover(slide: FlagshipSlide): string {
  return `/examples/protoyard-create-anything--${slide.id}.png`;
}

export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  deck: 'Slide deck',
  page: 'Landing page',
  doc: 'Document',
};
