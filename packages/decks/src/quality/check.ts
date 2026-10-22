import { type Block, blockText, countWords, forEachBlock } from '@protoyard/blocks';
import { getDeckLayout, parseLayoutProps } from '../layouts/catalog.ts';
import { stripStepMarkers } from '../layouts/props.ts';
import { stepMarkersOutsideLayout } from '../layouts/steppable.ts';
import { LAYOUT_PACING, type LayoutPacing } from '../layouts/types.ts';
import { slideSteps } from '../motion/steps.ts';
import type { Deck, DeckSlide } from '../schema/index.ts';
import {
  DECK_QUALITY,
  DECK_QUALITY_RULE_BY_ID,
  type DeckQualityRuleId,
  type DeckQualitySeverity,
} from './rules.ts';

/** One finding, addressed like deck schema issues (`$.slides[3].props.image.alt`). */
export interface DeckQualityIssue {
  rule: DeckQualityRuleId;
  severity: DeckQualitySeverity;
  /** The slide the issue is on, or null for deck-wide issues. */
  slideId: string | null;
  path: (string | number)[];
  jsonPath: string;
  message: string;
}

export interface DeckQualityReport {
  /** True when there are no errors (warnings allowed). */
  ok: boolean;
  errors: number;
  warnings: number;
  issues: DeckQualityIssue[];
}

/** The deck schema's JSONPath style: `$.slides[0].props["two words"]`. */
export function deckJsonPath(path: readonly (string | number)[]): string {
  return path.reduce<string>((out, part) => {
    if (typeof part === 'number') return `${out}[${part}]`;
    return /^[A-Za-z_$][\w$]*$/.test(part) ? `${out}.${part}` : `${out}[${JSON.stringify(part)}]`;
  }, '$');
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Props nest at most a few levels (DECK_LIMITS.propsDepth); this bound covers them with room. */
const MAX_WALK_DEPTH = 8;

/** Calls `visit` for every object in a props tree, in key order, with its path. */
function walkProps(
  value: unknown,
  path: (string | number)[],
  visit: (
    record: Record<string, unknown>,
    path: (string | number)[],
    key: string | number | null
  ) => void,
  key: string | number | null = null,
  depth = 0
): void {
  if (depth > MAX_WALK_DEPTH || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      walkProps(item, [...path, i], visit, i, depth + 1);
    });
    return;
  }
  visit(value as Record<string, unknown>, path, key);
  for (const [childKey, child] of Object.entries(value)) {
    walkProps(child, [...path, childKey], visit, childKey, depth + 1);
  }
}

// ── words ─────────────────────────────────────────────────────────────────

/** Prop keys whose values are not read as words on the slide. */
const NON_TEXT_PROPS = new Set([
  'src',
  'href',
  'alt',
  'lang',
  'source',
  'highlights',
  'avatar',
  'icon',
  'overlay',
  'spec',
  'height',
  'showTable',
  'width',
  'autoplay',
  'loop',
  'muted',
  'step',
  'fragment',
  'reveal',
]);

function propsWords(value: unknown, depth = 0): number {
  if (depth > MAX_WALK_DEPTH) return 0;
  if (typeof value === 'string') return countWords(value);
  if (Array.isArray(value))
    return value.reduce<number>((sum, item) => sum + propsWords(item, depth + 1), 0);
  if (!isRecord(value)) return 0;
  let sum = 0;
  for (const [key, child] of Object.entries(value)) {
    if (!NON_TEXT_PROPS.has(key)) sum += propsWords(child, depth + 1);
  }
  return sum;
}

function blocksWords(blocks: readonly Block[]): number {
  let sum = 0;
  forEachBlock(blocks, (block) => {
    // Code is read as code, not prose; an image's alt text is not on the slide.
    if (block.type === 'code') return;
    if (block.type === 'image') {
      sum += countWords([block.caption ?? '', block.credit ?? ''].join(' '));
      return;
    }
    sum += countWords(blockText(block));
  });
  return sum;
}

function slideWords(slide: DeckSlide): number {
  return 'blocks' in slide ? blocksWords(slide.blocks as Block[]) : propsWords(slide.props);
}

/** The most lenient word limit among the pacing types the slide's layout fits. */
function wordLimit(slide: DeckSlide): { limit: number; pacing: LayoutPacing } {
  const pacing = getDeckLayout(slide.layout)?.pacing ?? LAYOUT_PACING;
  let best: LayoutPacing = pacing[0] ?? 'idea';
  for (const type of pacing)
    if (DECK_QUALITY.maxWords[type] > DECK_QUALITY.maxWords[best]) best = type;
  return { limit: DECK_QUALITY.maxWords[best], pacing: best };
}

// ── steps ─────────────────────────────────────────────────────────────────

const validStep = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 1_000;

/** Fragments in reading order: free blocks depth-first, catalog props in key order. */
function fragmentsInOrder(
  slide: DeckSlide,
  base: (string | number)[]
): { step: number; path: (string | number)[] }[] {
  const found: { step: number; path: (string | number)[] }[] = [];
  if ('blocks' in slide) {
    forEachBlock(slide.blocks as Block[], (block, path) => {
      if (validStep(block.step))
        found.push({ step: block.step, path: [...base, 'blocks', ...path, 'step'] });
    });
  } else {
    walkProps(slide.props, [...base, 'props'], (record, path) => {
      if (validStep(record.step)) found.push({ step: record.step, path: [...path, 'step'] });
    });
  }
  return found;
}

// ── notes ─────────────────────────────────────────────────────────────────

const normalizeNotes = (notes: string) =>
  notes
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim();

const BOILERPLATE = DECK_QUALITY.notesBoilerplate.map(normalizeNotes);

/**
 * Static deck quality checks: everything that needs no browser. Takes a deck
 * that already passed `safeParseDeck`; never throws. Each issue names its rule
 * (`DECK_QUALITY_RULES`), severity, slide and JSONPath, so `deck lint`, the
 * visual sweep and editors report the same findings. Hidden slides are still
 * checked for structure, assets and step order, but not for notes, words or
 * layout repetition, since nobody sees them.
 */
export function checkDeckStatic(deck: Deck): DeckQualityReport {
  const issues: DeckQualityIssue[] = [];
  const add = (
    rule: DeckQualityRuleId,
    slideId: string | null,
    path: (string | number)[],
    message: string
  ) => {
    issues.push({
      rule,
      severity: DECK_QUALITY_RULE_BY_ID[rule].severity,
      slideId,
      path,
      jsonPath: deckJsonPath(path),
      message,
    });
  };

  const notesSeen = new Map<string, string>();
  let runLayout: string | null = null;
  let runStart = 0;
  let runLength = 0;

  deck.slides.forEach((slide, index) => {
    const base: (string | number)[] = ['slides', index];
    const id = slide.id;

    // Structure: layout and props. A custom slide's props are its component id and data.
    if (slide.layout === 'custom') {
      const component = 'props' in slide ? (slide.props as { component?: unknown }).component : '';
      add(
        'custom-slide',
        id,
        [...base, 'props', 'component'],
        `Slide "${id}" renders the custom component "${String(component)}": it runs in the generated deck; the player shows a placeholder.`
      );
    } else if (slide.layout !== 'free') {
      if (!getDeckLayout(slide.layout)) {
        add('unknown-layout', id, [...base, 'layout'], `Unknown layout "${slide.layout}".`);
      } else if ('props' in slide) {
        const parsed = parseLayoutProps(slide.layout, stripStepMarkers(slide.props));
        if (!parsed.success) {
          for (const problem of parsed.issues) {
            add('layout-props', id, [...base, 'props', ...problem.path], problem.message);
          }
        }
      }
    }

    // Assets: images in layout props (image blocks enforce alt and size in their schema).
    if ('props' in slide && slide.layout !== 'custom') {
      walkProps(slide.props, [...base, 'props'], (record, path, key) => {
        if (key !== 'image' || typeof record.src !== 'string') return;
        if (typeof record.alt !== 'string' || record.alt.trim() === '') {
          add('image-alt', id, [...path, 'alt'], `Describe the image "${record.src}" in alt.`);
        }
        if (typeof record.width !== 'number' || typeof record.height !== 'number') {
          add('image-size', id, path, `Give the image "${record.src}" a width and height.`);
        }
      });
    }

    // Step order: in reading order, a fragment never reveals before one above it.
    let latest = 0;
    let latestPath: (string | number)[] = [];
    for (const fragment of fragmentsInOrder(slide, base)) {
      if (fragment.step < latest) {
        add(
          'step-order',
          id,
          fragment.path,
          `Step ${fragment.step} reveals before ${deckJsonPath(latestPath)} (step ${latest}), which comes earlier on the slide. Renumber the steps in reading order.`
        );
      }
      if (fragment.step > latest) {
        latest = fragment.step;
        latestPath = fragment.path;
      }
    }
    const labels = slide.steps?.length ?? 0;
    const used = slideSteps(slide).steps.filter((step) => step.fragments.length > 0).length;
    // A custom slide's steps are its labels: its component reveals what it likes.
    if (labels > used && slide.layout !== 'custom') {
      add(
        'empty-steps',
        id,
        [...base, 'steps', used],
        `The slide labels ${labels} steps but only ${used} reveal something; the extra clicks do nothing.`
      );
    }
    for (const path of stepMarkersOutsideLayout(slide)) {
      add(
        'step-unrevealed',
        id,
        [...base, 'props', ...path],
        `The ${slide.layout} layout does not reveal a step marker here, so this click shows nothing. Move the marker to a prop the layout reveals (see DECK_LAYOUT_STEPPABLE), or use a free slide.`
      );
    }

    if (slide.hidden) return;

    // Notes.
    const notes = slide.notes?.trim() ?? '';
    if (notes.length < DECK_QUALITY.minNotesLength) {
      add(
        'notes-missing',
        id,
        [...base, 'notes'],
        notes
          ? `Speaker notes are ${notes.length} characters; write at least ${DECK_QUALITY.minNotesLength}.`
          : 'Add speaker notes: what to say on this slide.'
      );
    }
    if (notes) {
      const key = normalizeNotes(notes);
      if (BOILERPLATE.some((phrase) => key.includes(phrase))) {
        add(
          'notes-boilerplate',
          id,
          [...base, 'notes'],
          'Write what to say instead of "do not read the slide".'
        );
      }
      const first = notesSeen.get(key);
      if (first !== undefined) {
        add(
          'notes-duplicate',
          id,
          [...base, 'notes'],
          `These notes repeat the notes of slide "${first}".`
        );
      } else {
        notesSeen.set(key, id);
      }
    }

    // Layout repetition among visible slides.
    if (slide.layout === runLayout) {
      runLength += 1;
    } else {
      runLayout = slide.layout;
      runStart = index;
      runLength = 1;
    }
    if (runLength > DECK_QUALITY.maxLayoutRun) {
      add(
        'layout-repetition',
        id,
        [...base, 'layout'],
        `${runLength} slides in a row (from slides[${runStart}]) use the "${slide.layout}" layout; vary the layout to keep attention.`
      );
    }

    // Density.
    const words = slideWords(slide);
    const { limit, pacing } = wordLimit(slide);
    if (words > limit) {
      add(
        'too-many-words',
        id,
        [...base, 'blocks' in slide ? 'blocks' : 'props'],
        `The slide shows ${words} words; a ${pacing} slide holds at most ${limit}. Split it or move detail to the notes.`
      );
    }
  });

  const errors = issues.filter((issue) => issue.severity === 'error').length;
  return { ok: errors === 0, errors, warnings: issues.length - errors, issues };
}
