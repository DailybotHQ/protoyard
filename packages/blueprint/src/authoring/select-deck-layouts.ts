/**
 * Deterministic deck layout selection from slide roles, pacing, block contents
 * and optional author overrides. Pure: no Math.random, no Date.now.
 *
 * Uses the read-only `@protoyard/decks/layouts` catalog (AUTHORING + DECKS).
 */
import {
  DECK_LAYOUT_BY_ID,
  DECK_LAYOUTS,
  type DeckLayoutEntry,
  type LayoutPacing,
} from '@protoyard/decks/layouts';

/** One slide plan row (from deck-outlines or an authoring tool). */
export type DeckLayoutSlideInput = {
  id: string;
  /** Semantic role from the outline (`title`, `metrics`, `close`, …). */
  role: string;
  /** Punch / idea / diagram / story. */
  pacing: LayoutPacing | string;
  purpose?: string;
  /**
   * Explicit layout id. When set and present in the catalog, it wins and is
   * never replaced to avoid three-in-a-row (author intent).
   */
  layout?: string;
  /** Block `type` values on a free slide, used as capacity signals. */
  blockTypes?: readonly string[];
};

export type DeckLayoutSelection = {
  id: string;
  layout: string;
  /** Why this layout was chosen (stable wording for the same inputs). */
  rationale: string;
  /** True when the author override was used. */
  override: boolean;
};

export type SelectDeckLayoutsOptions = {
  /** Deck aspect (`16:9`, `9:16`, …). Portrait slightly prefers free/centered. */
  aspect?: string;
  /** Catalog override for tests. */
  catalog?: readonly DeckLayoutEntry[];
};

/** Preferred catalog layouts for each outline role (ordered). */
const ROLE_LAYOUTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  title: ['title-hero'],
  agenda: ['section-divider', 'two-column-split', 'process-steps'],
  close: ['closing-cta', 'quote'],
  ask: ['closing-cta'],
  section: ['section-divider'],
  hook: ['title-hero', 'big-stat', 'quote'],
  problem: ['two-column-split', 'image-left', 'free'],
  solution: ['two-column-split', 'three-column-cards', 'process-steps'],
  'business-model': ['two-column-split', 'three-column-cards'],
  'why-now': ['big-stat', 'two-column-split'],
  pricing: ['comparison-table', 'three-column-cards'],
  metrics: ['big-stat', 'chart'],
  chart: ['chart', 'big-stat'],
  comparison: ['comparison-table'],
  steps: ['process-steps'],
  process: ['process-steps'],
  progress: ['process-steps', 'timeline'],
  timeline: ['timeline'],
  roadmap: ['timeline', 'process-steps'],
  plan: ['timeline', 'process-steps', 'two-column-split'],
  team: ['team-avatars'],
  quote: ['quote'],
  story: ['process-steps', 'timeline', 'free'],
  demo: ['image-centered', 'video-centered', 'image-left'],
  code: ['code-with-callout'],
  concept: ['two-column-split', 'three-column-cards', 'free'],
  context: ['two-column-split', 'free'],
  findings: ['three-column-cards', 'two-column-split', 'chart'],
  method: ['process-steps', 'two-column-split'],
  objectives: ['three-column-cards', 'process-steps'],
  wins: ['three-column-cards', 'big-stat'],
  misses: ['two-column-split', 'free'],
  risks: ['two-column-split', 'free'],
  recommendations: ['process-steps', 'three-column-cards'],
  resources: ['three-column-cards', 'free'],
  recap: ['process-steps', 'section-divider'],
  homework: ['process-steps', 'free'],
  poll: ['free'],
  quiz: ['free'],
  audience: ['team-avatars', 'free'],
  activity: ['process-steps', 'free'],
  example: ['image-right', 'two-column-split', 'free'],
});

/** Block types that strongly suggest a layout. */
const BLOCK_LAYOUTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  chart: ['chart'],
  table: ['comparison-table'],
  comparison: ['comparison-table'],
  steps: ['process-steps'],
  timeline: ['timeline'],
  people: ['team-avatars'],
  quote: ['quote'],
  cards: ['three-column-cards'],
  code: ['code-with-callout'],
  image: ['image-centered', 'image-left', 'image-right'],
  video: ['video-centered', 'video-left'],
  cta: ['closing-cta'],
  stat: ['big-stat'],
});

const FALLBACK_BY_PACING: Readonly<Record<string, readonly string[]>> = Object.freeze({
  punch: ['big-stat', 'section-divider', 'quote', 'title-hero', 'free'],
  idea: ['two-column-split', 'three-column-cards', 'process-steps', 'free'],
  diagram: ['process-steps', 'timeline', 'chart', 'comparison-table', 'free'],
  story: ['timeline', 'process-steps', 'quote', 'image-full-bleed', 'free'],
});

/**
 * Select one catalog layout per slide. Deterministic for the same inputs.
 * Avoids three identical layouts in a row when another compatible layout fits.
 */
export function selectDeckLayouts(
  slides: readonly DeckLayoutSlideInput[],
  options: SelectDeckLayoutsOptions = {}
): DeckLayoutSelection[] {
  const catalog = options.catalog ?? DECK_LAYOUTS;
  const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  const aspect = options.aspect ?? '16:9';
  const previous: string[] = [];
  const out: DeckLayoutSelection[] = [];

  for (const slide of slides) {
    const override = slide.layout?.trim();
    if (override && byId.has(override)) {
      out.push({
        id: slide.id,
        layout: override,
        rationale: `Author override: layout "${override}".`,
        override: true,
      });
      previous.push(override);
      continue;
    }

    const candidates = rankCandidates(slide, byId, aspect);
    let chosen = candidates[0] ?? 'free';
    let avoidedRepeat = false;

    // Avoid three identical layouts in a row when an alternative remains.
    if (
      previous.length >= 2 &&
      previous[previous.length - 1] === previous[previous.length - 2] &&
      previous[previous.length - 1] === chosen
    ) {
      const alt = candidates.find((id) => id !== chosen);
      if (alt) {
        chosen = alt;
        avoidedRepeat = true;
      }
    }

    const entry = byId.get(chosen);
    const reasons = [
      `Role "${slide.role}" with pacing "${slide.pacing}"`,
      slide.blockTypes && slide.blockTypes.length > 0
        ? `blocks [${[...new Set(slide.blockTypes)].sort().join(', ')}]`
        : null,
      entry ? `fits catalog "${entry.id}" (${entry.label})` : null,
      avoidedRepeat ? 'avoided a third identical layout in a row' : null,
      aspect !== '16:9' ? `aspect ${aspect}` : null,
    ].filter(Boolean);

    out.push({
      id: slide.id,
      layout: chosen,
      rationale: `${reasons.join('; ')}.`,
      override: false,
    });
    previous.push(chosen);
  }

  return out;
}

/**
 * Minimal valid catalog `props` for a layout, seeded from the slide title.
 * Used when rewriting free outline slides to catalog slides.
 */
export function propsForSelectedLayout(
  layoutId: string,
  slide: { title?: string; purpose?: string }
): Record<string, unknown> {
  const entry = DECK_LAYOUT_BY_ID[layoutId] ?? getFromList(layoutId);
  const sample =
    entry && typeof entry.sample === 'object' && entry.sample !== null
      ? structuredClone(entry.sample as Record<string, unknown>)
      : {};
  if (layoutId === 'free' || entry?.id === 'free') {
    return { blocks: [] };
  }
  const title = slide.title?.trim();
  if (title) {
    if ('title' in sample) sample.title = title;
    else if (layoutId === 'big-stat' && 'label' in sample) sample.label = title;
  }
  return sample;
}

function getFromList(id: string): DeckLayoutEntry | undefined {
  return DECK_LAYOUTS.find((entry) => entry.id === id);
}

function rankCandidates(
  slide: DeckLayoutSlideInput,
  byId: Map<string, DeckLayoutEntry>,
  aspect: string
): string[] {
  const pacing = normalizePacing(slide.pacing);
  const roleKey = slide.role.trim().toLowerCase();
  const fromRole = ROLE_LAYOUTS[roleKey] ?? [];
  const fromBlocks = blockHints(slide.blockTypes);
  const fromPacing = FALLBACK_BY_PACING[pacing] ?? FALLBACK_BY_PACING.idea ?? ['free'];

  const ordered = unique([...fromBlocks, ...fromRole, ...fromPacing, 'free']);
  const filtered = ordered.filter((id) => {
    const entry = byId.get(id);
    if (!entry) return id === 'free';
    if (entry.pacing.length > 0 && !entry.pacing.includes(pacing as LayoutPacing)) {
      // Still allow if role strongly requested it
      if (fromRole.includes(id) || fromBlocks.includes(id)) return true;
      return false;
    }
    return true;
  });

  // Portrait decks: prefer centered/free over wide multi-column when tied.
  if (aspect === '9:16' || aspect === '1:1') {
    filtered.sort((a, b) => portraitScore(b) - portraitScore(a));
  }

  return filtered.length > 0 ? filtered : ['free'];
}

function blockHints(types: readonly string[] | undefined): string[] {
  if (!types || types.length === 0) return [];
  const out: string[] = [];
  for (const type of types) {
    const layouts = BLOCK_LAYOUTS[type];
    if (layouts) out.push(...layouts);
  }
  return out;
}

function normalizePacing(value: string): string {
  const v = value.trim().toLowerCase();
  if (v === 'punch' || v === 'idea' || v === 'diagram' || v === 'story') return v;
  return 'idea';
}

function unique(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function portraitScore(layoutId: string): number {
  if (layoutId === 'free' || layoutId.includes('centered') || layoutId === 'title-hero') return 2;
  if (layoutId === 'section-divider' || layoutId === 'quote' || layoutId === 'big-stat') return 1;
  return 0;
}
