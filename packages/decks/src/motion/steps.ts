import { type Block, forEachBlock } from '@protoyard/blocks';
import { DECK_LIMITS, type DeckSlide } from '../schema/index.ts';

/**
 * Steps and fragments of one slide.
 *
 * A slide starts at step 0 and advances one step per "next". Authors give
 * fragments an authored step number (a block's `step`, a code block's stepped
 * `highlights`, or a `{ step, fragment }` object in a catalog slide's props);
 * the engine sorts the distinct numbers and renumbers them 1, 2, 3…, so the
 * order is always monotonic and gaps ("step": 2 then 5) never cost an empty
 * click. A fragment with step 0 is part of the slide's initial state.
 */

/** Fragment effects (the site's fragment classes). */
export const FRAGMENT_EFFECTS = [
  'fade-up',
  'in',
  'out',
  'in-then-out',
  'grow',
  'shrink',
  'highlight',
  'strike',
] as const;
export type FragmentEffect = (typeof FRAGMENT_EFFECTS)[number];

export function isFragmentEffect(value: unknown): value is FragmentEffect {
  return typeof value === 'string' && (FRAGMENT_EFFECTS as readonly string[]).includes(value);
}

/** The block contract's `reveal` vocabulary, in fragment terms (`fade` is a plain `in`). */
const REVEAL_EFFECT: Readonly<Record<NonNullable<Block['reveal']>, FragmentEffect>> = {
  fade: 'in',
  'fade-up': 'fade-up',
  grow: 'grow',
  highlight: 'highlight',
  strike: 'strike',
};

export type FragmentSource =
  | { kind: 'block'; path: (string | number)[]; blockId?: string }
  | { kind: 'code-highlight'; path: (string | number)[]; blockId?: string; lines: string }
  | { kind: 'prop'; path: (string | number)[] };

export interface SlideFragment {
  /** The step (1-based, dense) at which the effect happens; 0 is the initial state. */
  index: number;
  /** The authored step number before renumbering. */
  authored: number;
  effect: FragmentEffect;
  source: FragmentSource;
}

export interface SlideStep {
  /** 1-based. */
  index: number;
  /** The author's label from `slide.steps[index - 1]`, when given. */
  label?: string;
  fragments: SlideFragment[];
}

export interface SlideSteps {
  slideId: string;
  /** Advances on this slide ("next" presses before moving to the next slide). */
  count: number;
  /** Fragments that are already in place at step 0. */
  initial: SlideFragment[];
  /** One entry per step, in order. */
  steps: SlideStep[];
  /** Fragments merged into the last step because the slide had more than `DECK_LIMITS.steps`. */
  warnings: string[];
}

interface Raw {
  authored: number;
  effect: FragmentEffect;
  source: FragmentSource;
  /** Order of discovery, to keep fragments of one step in document order. */
  order: number;
}

const MAX_PROP_DEPTH = DECK_LIMITS.propsDepth + 1;

function validStep(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1_000;
}

function fromBlocks(blocks: readonly Block[], out: Raw[]): void {
  forEachBlock(blocks, (block, path) => {
    const blockId = typeof block.id === 'string' ? block.id : undefined;
    const base = block.step;
    if (block.type === 'code' && block.highlights?.length) {
      // One highlight per step, starting at the block's own step.
      block.highlights.forEach((lines, i) => {
        out.push({
          authored: (base ?? 0) + i,
          effect: 'highlight',
          source: { kind: 'code-highlight', path: [...path, 'highlights', i], blockId, lines },
          order: out.length,
        });
      });
      // The block itself still enters at its step when it has one.
      if (base !== undefined && base > 0) {
        out.push({
          authored: base,
          effect: block.reveal ? REVEAL_EFFECT[block.reveal] : 'in',
          source: { kind: 'block', path, blockId },
          order: out.length,
        });
      }
      return;
    }
    if (base === undefined) return;
    out.push({
      authored: base,
      effect: block.reveal ? REVEAL_EFFECT[block.reveal] : 'in',
      source: { kind: 'block', path, blockId },
      order: out.length,
    });
  });
}

/**
 * Catalog layouts mark a fragment in their props with an object that has a
 * numeric `step` and, optionally, `fragment` (any effect) or `reveal` (the
 * block vocabulary). Anything else is content and is ignored here.
 */
function fromProps(value: unknown, path: (string | number)[], depth: number, out: Raw[]): void {
  if (depth > MAX_PROP_DEPTH || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      fromProps(item, [...path, i], depth + 1, out);
    });
    return;
  }
  const record = value as Record<string, unknown>;
  if (validStep(record.step)) {
    const effect = isFragmentEffect(record.fragment)
      ? record.fragment
      : typeof record.reveal === 'string' && record.reveal in REVEAL_EFFECT
        ? REVEAL_EFFECT[record.reveal as keyof typeof REVEAL_EFFECT]
        : 'in';
    out.push({ authored: record.step, effect, source: { kind: 'prop', path }, order: out.length });
  }
  for (const key of Object.keys(record)) {
    if (key === 'step' || key === 'fragment' || key === 'reveal') continue;
    fromProps(record[key], [...path, key], depth + 1, out);
  }
}

/** Derives the ordered steps of a slide from the blocks or props it renders. */
export function slideSteps(slide: DeckSlide): SlideSteps {
  const raw: Raw[] = [];
  // `layout: string` on catalog slides overlaps `'free'`, so narrow on the body key.
  if ('blocks' in slide) fromBlocks(slide.blocks as Block[], raw);
  else fromProps(slide.props, ['props'], 0, raw);

  const distinct = [...new Set(raw.map((r) => r.authored).filter((n) => n > 0))].sort(
    (a, b) => a - b
  );
  const warnings: string[] = [];
  if (distinct.length > DECK_LIMITS.steps) {
    warnings.push(
      `Slide "${slide.id}" has ${distinct.length} steps; steps after ${DECK_LIMITS.steps} play together on the last one.`
    );
  }
  const indexOf = new Map(distinct.map((n, i) => [n, Math.min(i + 1, DECK_LIMITS.steps)]));

  const labels = slide.steps ?? [];
  const count = Math.min(
    DECK_LIMITS.steps,
    Math.max(indexOf.size ? Math.max(...indexOf.values()) : 0, labels.length)
  );
  const steps: SlideStep[] = Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    ...(labels[i] !== undefined ? { label: labels[i] } : {}),
    fragments: [],
  }));
  const initial: SlideFragment[] = [];
  for (const r of [...raw].sort((a, b) => a.authored - b.authored || a.order - b.order)) {
    const index = r.authored === 0 ? 0 : (indexOf.get(r.authored) as number);
    const fragment: SlideFragment = {
      index,
      authored: r.authored,
      effect: r.effect,
      source: r.source,
    };
    if (index === 0) initial.push(fragment);
    else (steps[index - 1] as SlideStep).fragments.push(fragment);
  }
  return { slideId: slide.id, count, initial, steps, warnings };
}

/** How many "next" presses a slide takes before the deck moves on. */
export function slideStepCount(slide: DeckSlide): number {
  return slideSteps(slide).count;
}

export interface FragmentPhase {
  /** Rendered at all (an `out` fragment disappears; `in-then-out` shows only on its step). */
  visible: boolean;
  /** The effect is applied (a highlight is on, a strike is drawn, a grow has grown). */
  active: boolean;
}

/**
 * What a fragment looks like at `current` (0 = initial state). Steps past the
 * slide's count behave like its last step; a negative step is the initial state.
 */
export function fragmentPhase(
  fragment: Pick<SlideFragment, 'index' | 'effect'>,
  current: number
): FragmentPhase {
  const at = Math.max(0, Math.trunc(Number.isFinite(current) ? current : 0));
  const reached = at >= fragment.index;
  switch (fragment.effect) {
    case 'in':
    case 'fade-up':
      return { visible: reached, active: reached };
    case 'out':
      return { visible: !reached, active: reached };
    case 'in-then-out':
      return { visible: at === fragment.index, active: at === fragment.index };
    case 'grow':
    case 'shrink':
    case 'highlight':
    case 'strike':
      return { visible: true, active: reached };
  }
}

/**
 * The code highlight shown at `current`: the latest highlight whose step was
 * reached, or none before the first one.
 */
export function activeCodeHighlight(
  fragments: readonly SlideFragment[],
  blockPath: readonly (string | number)[],
  current: number
): string | null {
  const key = JSON.stringify(blockPath);
  let shown: string | null = null;
  for (const fragment of fragments) {
    if (fragment.source.kind !== 'code-highlight') continue;
    if (JSON.stringify(fragment.source.path.slice(0, -2)) !== key) continue;
    if (fragment.index <= current) shown = fragment.source.lines;
  }
  return shown;
}

/** Every fragment of a slide, initial state first, in step order. */
export function slideFragments(steps: SlideSteps): SlideFragment[] {
  return [...steps.initial, ...steps.steps.flatMap((step) => step.fragments)];
}
