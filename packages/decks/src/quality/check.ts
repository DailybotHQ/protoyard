import { type Block, blockText, countWords, forEachBlock } from '@protoyard/blocks';
import { lintDeck } from '@texuli/deck/authoring';
import {
  DECK_BACKGROUND_PRESETS,
  DEFAULT_DECK_BACKGROUND,
  getDeckLayout,
  LAYOUT_PACING,
  type LayoutPacing,
} from '@texuli/deck/model';
import { stepMarkersOutsideLayout } from '../layouts/steppable.ts';
import type { Deck, DeckSlide } from '../schema/index.ts';
import { toTexuliDeck } from '../texuli.ts';
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

/** Rules Protoyard checks itself on the stored deck (see `checkDeckStatic`). */
const PROTOYARD_RULES: ReadonlySet<string> = new Set([
  'too-many-words',
  'step-unrevealed',
  'notes-boilerplate',
]);

const normalizeNotes = (notes: string) =>
  notes
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim();

const BOILERPLATE = DECK_QUALITY.notesBoilerplate.map(normalizeNotes);

/**
 * The static deck checks: `@texuli/deck`'s `lintDeck` on the migrated deck,
 * reported with Protoyard's rule ids, severities and JSON paths (the deck
 * body's paths: `$.slides[3].props.image.alt`). Suggestions outside
 * Protoyard's rule table (`prefer-layout`) are left out. `too-many-words` stays
 * Protoyard's: it counts only what a slide shows (`blockText` of each block,
 * captions but not alt text, no code), where the model's lint also counts
 * block settings (chart kinds, column widths) and reports free slides at
 * `props`; so does `step-unrevealed`, on the stored slide (migrating a chart
 * spec rebuilds its series), and `notes-boilerplate`, which flags notes that
 * contain a boilerplate phrase (the model's lint only flags notes that are
 * exactly one). The rendered rules
 * (font size, overflow, contrast) need a browser: the visual sweep runs them.
 */
export function checkDeckStatic(deck: Deck): DeckQualityReport {
  const report = lintDeck(toTexuliDeck(deck));
  const issues: DeckQualityIssue[] = [];
  for (const item of report.issues) {
    const rule = DECK_QUALITY_RULE_BY_ID[item.rule as DeckQualityRuleId];
    if (!rule || PROTOYARD_RULES.has(rule.id)) continue;
    const path = [...item.path];
    // A custom slide's steps are its labels: the component reveals what it likes.
    if (rule.id === 'empty-steps' && isCustomAt(deck, path)) continue;
    issues.push({
      rule: rule.id as DeckQualityRuleId,
      severity: item.severity === 'error' ? 'error' : 'warning',
      slideId: item.slideId ?? slideIdAt(deck, path),
      path,
      jsonPath: deckJsonPath(path),
      message: item.message,
    });
  }
  // Migration maps an unknown background slug from an older deck to the default,
  // so the model's lint never sees it: Protoyard reports it on the deck as stored.
  deck.slides.forEach((slide, index) => {
    if (
      typeof slide.background === 'string' &&
      !Object.hasOwn(DECK_BACKGROUND_PRESETS, slide.background)
    ) {
      const path = ['slides', index, 'background'];
      issues.push({
        rule: 'unknown-background',
        severity: 'warning',
        slideId: slide.id,
        path,
        jsonPath: deckJsonPath(path),
        message: `Unknown background "${slide.background}"; the slide renders ${DEFAULT_DECK_BACKGROUND}. Use a preset id or a media spec.`,
      });
    }
  });
  // Markers a layout does not reveal, found on the stored slide: migrating a chart spec
  // rebuilds its series, so the model's lint would not see a marker placed on one.
  deck.slides.forEach((slide, index) => {
    if (slide.layout === 'custom') return;
    for (const markerPath of stepMarkersOutsideLayout(slide)) {
      const path = ['slides', index, 'props', ...markerPath];
      issues.push({
        rule: 'step-unrevealed',
        severity: 'warning',
        slideId: slide.id,
        path,
        jsonPath: deckJsonPath(path),
        message: `The ${slide.layout} layout does not reveal a step marker here, so this click shows nothing. Move the marker to a prop the layout reveals (see DECK_LAYOUT_STEPPABLE), or use a free slide.`,
      });
    }
  });
  // Boilerplate anywhere in the notes of a visible slide.
  deck.slides.forEach((slide, index) => {
    if (slide.hidden || !slide.notes) return;
    const key = normalizeNotes(slide.notes);
    if (!BOILERPLATE.some((phrase) => key.includes(phrase))) return;
    const path = ['slides', index, 'notes'];
    issues.push({
      rule: 'notes-boilerplate',
      severity: 'warning',
      slideId: slide.id,
      path,
      jsonPath: deckJsonPath(path),
      message: 'Write what to say instead of "do not read the slide".',
    });
  });
  // Density, by the layout's pacing; hidden slides are not seen, so they are not counted.
  deck.slides.forEach((slide, index) => {
    if (slide.hidden) return;
    const words = slideWords(slide);
    const { limit, pacing } = wordLimit(slide);
    if (words <= limit) return;
    const path = ['slides', index, 'blocks' in slide ? 'blocks' : 'props'];
    issues.push({
      rule: 'too-many-words',
      severity: 'warning',
      slideId: slide.id,
      path,
      jsonPath: deckJsonPath(path),
      message: `The slide shows ${words} words; a ${pacing} slide holds at most ${limit}. Split it or move detail to the notes.`,
    });
  });
  const slideOf = (issue: DeckQualityIssue) =>
    issue.path[0] === 'slides' && typeof issue.path[1] === 'number' ? issue.path[1] : -1;
  issues.sort((a, b) => slideOf(a) - slideOf(b));
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  return { ok: errors === 0, errors, warnings: issues.length - errors, issues };
}

function slideIdAt(deck: Deck, path: readonly (string | number)[]): string | null {
  if (path[0] !== 'slides' || typeof path[1] !== 'number') return null;
  return deck.slides[path[1]]?.id ?? null;
}

function isCustomAt(deck: Deck, path: readonly (string | number)[]): boolean {
  return path[0] === 'slides' && typeof path[1] === 'number'
    ? deck.slides[path[1]]?.layout === 'custom'
    : false;
}
