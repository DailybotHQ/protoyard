/**
 * Deck design gate (tests/e2e/deck-design.spec.ts): what a well-designed slide
 * must measure in a real browser, as pure functions over measurements the
 * spec collects with `page.evaluate`. The visual sweep (deck-sweep.ts) checks
 * overflow and browser noise; this gate adds the things a passing sweep
 * missed on the flagship deck: the deck theme and slide backgrounds actually
 * applied, display-size titles on cover, divider and big-stat slides, chart
 * series with real geometry, and no two pieces of text drawn over each other.
 *
 * Every threshold is a ratio of the slide stage, so desktop and phone are held
 * to the same design, scaled.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Minimum display-title font size as a share of the stage height, per layout.
 * The 1280x720 canvas renders a cover title at 96 px (0.13), a divider title
 * at 80 px and a big-stat number at 144 px; the bug this gate exists for drew
 * the cover title at 24 px (0.033). The floor sits well between.
 */
export const DISPLAY_TITLE_MIN_RATIO: Readonly<Record<string, number>> = {
  'title-hero': 0.08,
  'section-divider': 0.07,
  'big-stat': 0.1,
};

/** Pixels a box may stick out of the stage before it counts (subpixel rounding, focus rings). */
export const OVERFLOW_TOLERANCE_PX = 2;

/**
 * Two text boxes overlap when they share at least this share of the smaller
 * box's area and at least `OVERLAP_MIN_PX` in both directions (touching line
 * boxes and descenders are not overlaps).
 */
export const OVERLAP_MIN_SHARE = 0.2;
export const OVERLAP_MIN_PX = 3;

/** Blocks a slide may hold that the gate exercises in the browser. */
export const INTERACTIVE_BLOCKS = [
  'poll',
  'quiz',
  'calculator',
  'chart-controls',
  'embed-app',
] as const;
export type InteractiveBlock = (typeof INTERACTIVE_BLOCKS)[number];

export interface DeckDesignSlidePlan {
  id: string;
  layout: string;
  /** The background preset the slide must show: its own, else the deck's, else none. */
  background: string | null;
  /** Minimum display-title ratio, for cover, divider and big-stat slides. */
  displayTitleMinRatio: number | null;
  /** True when the slide draws at least one chart. */
  charts: boolean;
  interactive: InteractiveBlock[];
}

export interface DeckDesignPlan {
  /** `deck.style.theme`, or null when the deck sets none. */
  theme: string | null;
  slides: DeckDesignSlidePlan[];
}

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every block in a list, nested blocks included (columns, tabs, reveals). */
function walkBlocks(value: unknown, visit: (block: Json) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walkBlocks(item, visit);
    return;
  }
  if (!isRecord(value)) return;
  if (typeof value.type === 'string') visit(value);
  for (const [key, child] of Object.entries(value)) {
    // An embedded app is its own document; its fields are not slide blocks.
    if (key === 'app') continue;
    if (Array.isArray(child) || isRecord(child)) walkBlocks(child, visit);
  }
}

/** What the gate expects of each visible slide of a deck blueprint (or a bare deck). */
export function planDeckDesign(blueprint: unknown): DeckDesignPlan {
  const root = isRecord(blueprint) ? blueprint : {};
  const deck = isRecord(root.deck) ? root.deck : root;
  const style = isRecord(deck.style) ? deck.style : {};
  const deckBackground = typeof style.background === 'string' ? style.background : null;
  const slides = Array.isArray(deck.slides) ? deck.slides.filter(isRecord) : [];
  return {
    theme: typeof style.theme === 'string' ? style.theme : null,
    slides: slides
      .filter((slide) => slide.hidden !== true && typeof slide.id === 'string')
      .map((slide) => {
        const layout = typeof slide.layout === 'string' ? slide.layout : 'free';
        const types = new Set<string>();
        walkBlocks(slide.blocks, (block) => types.add(block.type as string));
        return {
          id: slide.id as string,
          layout,
          background: typeof slide.background === 'string' ? slide.background : deckBackground,
          displayTitleMinRatio: DISPLAY_TITLE_MIN_RATIO[layout] ?? null,
          charts: layout === 'chart' || types.has('chart') || types.has('chart-controls'),
          interactive: INTERACTIVE_BLOCKS.filter((type) => types.has(type)),
        };
      }),
  };
}

/** A labelled box measured in the browser (CSS pixels, viewport coordinates). */
export interface LabelledBox {
  label: string;
  box: Box;
}

export interface ChartSeriesMeasure {
  /** The chart's accessible name or index. */
  chart: string;
  series: string;
  /** Bounding-box area of the series' marks (path, rect or circle), in CSS px². */
  area: number;
  /** False when a series path has an empty or missing `d`. */
  hasPath: boolean;
}

/** One slide as the browser drew it (collected by the spec). */
export interface DeckDesignMeasure {
  slideId: string;
  /** The active slide's stage box, or null when none rendered. */
  stage: Box | null;
  /** `data-py-deck-theme` on the deck root. */
  theme: string | null;
  /** `data-py-deck-background` on the active slide frame. */
  background: string | null;
  /** Font size (px) of the slide's display title, or null when none was found. */
  displayTitlePx: number | null;
  /** Visible text line boxes, one entry per line per text node. */
  textBoxes: LabelledBox[];
  /** Visible leaf content (text lines, images, SVG, canvas, frames) to keep inside the stage. */
  contentBoxes: LabelledBox[];
  /** Chart roots drawn on the slide. */
  charts: number;
  series: ChartSeriesMeasure[];
}

export type DeckDesignCode =
  | 'no-stage'
  | 'overflow'
  | 'text-overlap'
  | 'theme'
  | 'background'
  | 'display-title'
  | 'chart-missing'
  | 'chart-empty-series';

export interface DeckDesignFinding {
  code: DeckDesignCode;
  slideId: string;
  message: string;
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Boxes that stick out of the stage by more than the tolerance. */
export function findOverflow(
  stage: Box,
  boxes: readonly LabelledBox[],
  tolerance = OVERFLOW_TOLERANCE_PX
): { label: string; by: number }[] {
  const out: { label: string; by: number }[] = [];
  for (const { label, box } of boxes) {
    if (box.width <= 0 || box.height <= 0) continue;
    const by = Math.max(
      stage.x - box.x,
      stage.y - box.y,
      box.x + box.width - (stage.x + stage.width),
      box.y + box.height - (stage.y + stage.height)
    );
    if (by > tolerance) out.push({ label, by: round(by) });
  }
  return out;
}

function intersection(a: Box, b: Box): { width: number; height: number } {
  return {
    width: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    height: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  };
}

/** Pairs of text boxes drawn over each other (see OVERLAP_MIN_SHARE / OVERLAP_MIN_PX). */
export function findTextOverlaps(
  boxes: readonly LabelledBox[]
): { a: string; b: string; share: number }[] {
  const out: { a: string; b: string; share: number }[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const first = boxes[i] as LabelledBox;
      const second = boxes[j] as LabelledBox;
      // Lines of one text node never count against each other.
      if (first.label === second.label) continue;
      const overlap = intersection(first.box, second.box);
      if (overlap.width < OVERLAP_MIN_PX || overlap.height < OVERLAP_MIN_PX) continue;
      const smaller = Math.min(
        first.box.width * first.box.height,
        second.box.width * second.box.height
      );
      if (smaller <= 0) continue;
      const share = (overlap.width * overlap.height) / smaller;
      if (share >= OVERLAP_MIN_SHARE) {
        out.push({ a: first.label, b: second.label, share: Math.round(share * 100) / 100 });
      }
    }
  }
  return out;
}

/** Every design finding for one measured slide against its plan. */
export function classifyDeckDesign(
  plan: DeckDesignSlidePlan,
  measure: DeckDesignMeasure,
  deck: Pick<DeckDesignPlan, 'theme'>
): DeckDesignFinding[] {
  const slideId = plan.id;
  const finding = (code: DeckDesignCode, message: string): DeckDesignFinding => ({
    code,
    slideId,
    message,
  });
  const stage = measure.stage;
  if (!stage || stage.width <= 0 || stage.height <= 0) {
    return [finding('no-stage', 'The slide stage did not render.')];
  }
  const out: DeckDesignFinding[] = [];
  for (const { label, by } of findOverflow(stage, measure.contentBoxes).slice(0, 6)) {
    out.push(finding('overflow', `"${label}" sticks out of the stage by ${by}px.`));
  }
  for (const { a, b, share } of findTextOverlaps(measure.textBoxes).slice(0, 6)) {
    out.push(
      finding(
        'text-overlap',
        `"${a}" and "${b}" are drawn over each other (${Math.round(share * 100)}%).`
      )
    );
  }
  if (deck.theme !== null && measure.theme !== deck.theme) {
    out.push(
      finding('theme', `The deck theme is "${measure.theme ?? 'none'}", not "${deck.theme}".`)
    );
  }
  if (plan.background !== null && measure.background !== plan.background) {
    out.push(
      finding(
        'background',
        `The background is "${measure.background ?? 'none'}", not "${plan.background}".`
      )
    );
  }
  if (plan.displayTitleMinRatio !== null) {
    const ratio = measure.displayTitlePx === null ? 0 : measure.displayTitlePx / stage.height;
    if (ratio < plan.displayTitleMinRatio) {
      out.push(
        finding(
          'display-title',
          `The ${plan.layout} title is ${measure.displayTitlePx ?? 'missing'}px on a ${round(stage.height)}px stage (${round(ratio * 100)}%, needs at least ${plan.displayTitleMinRatio * 100}%).`
        )
      );
    }
  }
  if (plan.charts && measure.charts === 0) {
    out.push(finding('chart-missing', 'The slide should draw a chart and drew none.'));
  }
  if (plan.charts && measure.charts > 0 && measure.series.length === 0) {
    out.push(finding('chart-empty-series', 'The chart drew no series.'));
  }
  for (const series of measure.series) {
    if (series.area <= 0 || !series.hasPath) {
      out.push(
        finding(
          'chart-empty-series',
          `Series "${series.series}" of chart "${series.chart}" has no geometry.`
        )
      );
    }
  }
  return out;
}

/** One line per finding, for a test failure message. */
export function formatDeckDesignFindings(findings: readonly DeckDesignFinding[]): string[] {
  return findings.map((item) => `${item.slideId}: ${item.code}: ${item.message}`);
}
