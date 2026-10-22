/**
 * Pure half of the deck visual QA sweep (`scripts/sweep-deck.ts`):
 * arguments, issue classification, report shape and contact sheet.
 * No browser and no file system — unit-tested in `scripts/tests/deck-sweep.test.ts`.
 *
 * Deterministic failures (exit 1): overflow, missing image alt/dimensions,
 * broken images, navigation failures, console/page/request errors.
 * Heuristic findings (warnings, report-only until calibrated): font-too-small,
 * contrast estimates.
 */

import { DECK_TEXT_MINIMUMS } from '../../packages/decks/src/canvas.ts';

export const MIN_BODY_PX = DECK_TEXT_MINIMUMS.bodyPx;
export const MIN_LABEL_PX = DECK_TEXT_MINIMUMS.labelPx;

/** Default output under tmp/ (must stay inside tmp/). */
export const DEFAULT_DECK_SWEEP_OUT = 'tmp/deck-sweep';

/** Default example deck fixture for the browser sweep. */
export const DEFAULT_DECK_BLUEPRINT = 'blueprints/decks/example.json';

/** Private default loopback port family for lane-local runs (override with --port). */
export const DEFAULT_DECK_SWEEP_PORT = 0;

export type DeckSweepIssueCode =
  | 'overflow'
  | 'font-too-small'
  | 'image-failed'
  | 'image-missing-dimensions'
  | 'image-missing-alt'
  | 'fragment-order'
  | 'navigation'
  | 'console-error'
  | 'page-error'
  | 'request-failed'
  | 'contrast'
  | 'missing-app';

export type DeckSweepSeverity = 'error' | 'warning';

export interface DeckSweepIssue {
  code: DeckSweepIssueCode;
  severity: DeckSweepSeverity;
  slideId: string;
  step: number;
  message: string;
}

export interface DeckSweepSlideRow {
  slideId: string;
  step: number;
  title: string;
  shot?: string;
  issues: DeckSweepIssue[];
}

export interface DeckSweepReport {
  format: 'protoyard.deck-sweep';
  formatVersion: 1;
  blueprint: string;
  startedAt: string;
  finishedAt: string;
  viewport: { width: number; height: number };
  slides: DeckSweepSlideRow[];
  issues: DeckSweepIssue[];
  errors: number;
  warnings: number;
  ok: boolean;
}

export interface DeckSweepArgs {
  blueprint: string;
  out: string;
  port: number;
  noShots: boolean;
  viewport: { width: number; height: number };
  /** When true, skip launching the browser (unit/report helpers only). */
  dryRun: boolean;
}

const USAGE =
  'Usage: tsx scripts/sweep-deck.ts [--blueprint <path>] [--out tmp/deck-sweep] [--port N] [--viewport 1280x720] [--no-shots] [--dry-run]';

function listValue(value: string | undefined, flag: string): string {
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} needs a value. ${USAGE}`);
  }
  return value;
}

/** Parse CLI args; throws with usage for unknowns. */
export function parseDeckSweepArgs(argv: readonly string[]): DeckSweepArgs {
  const args: DeckSweepArgs = {
    blueprint: DEFAULT_DECK_BLUEPRINT,
    out: DEFAULT_DECK_SWEEP_OUT,
    port: DEFAULT_DECK_SWEEP_PORT,
    noShots: false,
    viewport: { width: 1280, height: 720 },
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i] as string;
    const next = argv[i + 1];
    switch (flag) {
      case '--blueprint':
        args.blueprint = listValue(next, flag);
        i += 1;
        break;
      case '--out': {
        const out = listValue(next, flag);
        if (!out.startsWith('tmp/') && out !== 'tmp') {
          throw new Error(`--out must be under tmp/ (got ${out}).`);
        }
        args.out = out;
        i += 1;
        break;
      }
      case '--port': {
        const port = Number(listValue(next, flag));
        if (!Number.isInteger(port) || port < 0 || port > 65_535) {
          throw new Error(`--port must be an integer 0–65535 (0 = ephemeral).`);
        }
        args.port = port;
        i += 1;
        break;
      }
      case '--viewport': {
        const raw = listValue(next, flag);
        const match = /^(\d{2,5})x(\d{2,5})$/.exec(raw);
        if (!match) throw new Error(`--viewport needs WxH, for example 1280x720.`);
        args.viewport = { width: Number(match[1]), height: Number(match[2]) };
        i += 1;
        break;
      }
      case '--no-shots':
        args.noShots = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--help':
      case '-h':
        throw new Error(USAGE);
      default:
        throw new Error(`Unknown flag ${flag}. ${USAGE}`);
    }
  }
  return args;
}

/** Severity policy: heuristics stay warnings until calibrated. */
export function severityFor(code: DeckSweepIssueCode): DeckSweepSeverity {
  if (code === 'contrast' || code === 'font-too-small') return 'warning';
  return 'error';
}

export function issue(
  code: DeckSweepIssueCode,
  slideId: string,
  step: number,
  message: string
): DeckSweepIssue {
  return { code, severity: severityFor(code), slideId, step, message };
}

/** Browser-measured facts for one slide/step (from page.evaluate). */
export interface DeckSlideMeasure {
  slideId: string;
  step: number;
  title: string;
  hasApp: boolean;
  overflows: string[];
  smallFonts: string[];
  images: Array<{
    src: string;
    ok: boolean;
    hasWidth: boolean;
    hasHeight: boolean;
    hasAlt: boolean;
  }>;
  fragmentIndexes: Array<number | null>;
  /** Estimated contrast failures (heuristic). */
  contrast: string[];
}

/** Turn measurements into classified issues (pure). */
export function classifySlideMeasure(measure: DeckSlideMeasure): DeckSweepIssue[] {
  const { slideId, step } = measure;
  const out: DeckSweepIssue[] = [];
  if (!measure.hasApp) {
    out.push(
      issue('missing-app', slideId, step, 'Deck app root [data-py-deck-app] was not found.')
    );
    return out;
  }
  for (const overflow of measure.overflows.slice(0, 8)) {
    out.push(issue('overflow', slideId, step, overflow));
  }
  for (const font of measure.smallFonts.slice(0, 8)) {
    out.push(issue('font-too-small', slideId, step, font));
  }
  for (const image of measure.images) {
    if (!image.ok)
      out.push(issue('image-failed', slideId, step, `image failed: ${image.src || '(empty src)'}`));
    if (!image.hasWidth || !image.hasHeight) {
      out.push(
        issue(
          'image-missing-dimensions',
          slideId,
          step,
          `img lacks width/height: ${image.src || '(empty src)'}`
        )
      );
    }
    if (!image.hasAlt) {
      out.push(
        issue('image-missing-alt', slideId, step, `img lacks alt: ${image.src || '(empty src)'}`)
      );
    }
  }
  const indexes = measure.fragmentIndexes.filter((value): value is number => value !== null);
  if (indexes.some((value, index) => index > 0 && value < (indexes[index - 1] as number))) {
    out.push(
      issue('fragment-order', slideId, step, `fragment order not monotonic: ${indexes.join(',')}`)
    );
  }
  for (const contrast of measure.contrast.slice(0, 8)) {
    out.push(issue('contrast', slideId, step, contrast));
  }
  return out;
}

export function classifyBrowserNoise(
  slideId: string,
  step: number,
  noise: { console: string[]; pageErrors: string[]; requestFailed: string[] }
): DeckSweepIssue[] {
  const out: DeckSweepIssue[] = [];
  for (const message of noise.console) {
    out.push(issue('console-error', slideId, step, message.slice(0, 400)));
  }
  for (const message of noise.pageErrors) {
    out.push(issue('page-error', slideId, step, message.slice(0, 400)));
  }
  for (const message of noise.requestFailed) {
    out.push(issue('request-failed', slideId, step, message.slice(0, 400)));
  }
  return out;
}

export function summarizeIssues(issues: readonly DeckSweepIssue[]): {
  errors: number;
  warnings: number;
  ok: boolean;
} {
  let errors = 0;
  let warnings = 0;
  for (const entry of issues) {
    if (entry.severity === 'error') errors += 1;
    else warnings += 1;
  }
  return { errors, warnings, ok: errors === 0 };
}

/** Exit code: 1 when any deterministic error is present. */
export function exitCodeForReport(report: Pick<DeckSweepReport, 'errors'>): number {
  return report.errors > 0 ? 1 : 0;
}

export function buildReport(input: {
  blueprint: string;
  startedAt: string;
  finishedAt: string;
  viewport: { width: number; height: number };
  slides: DeckSweepSlideRow[];
}): DeckSweepReport {
  const issues = input.slides.flatMap((row) => row.issues);
  const summary = summarizeIssues(issues);
  return {
    format: 'protoyard.deck-sweep',
    formatVersion: 1,
    blueprint: input.blueprint,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    viewport: input.viewport,
    slides: input.slides,
    issues,
    errors: summary.errors,
    warnings: summary.warnings,
    ok: summary.ok,
  };
}

/** Parse a written report; throws if the shape is wrong. */
export function parseDeckSweepReport(raw: unknown): DeckSweepReport {
  if (!raw || typeof raw !== 'object') throw new Error('Deck sweep report must be an object.');
  const report = raw as Record<string, unknown>;
  if (report.format !== 'protoyard.deck-sweep') {
    throw new Error('Deck sweep report format must be protoyard.deck-sweep.');
  }
  if (report.formatVersion !== 1) {
    throw new Error(`Unsupported deck sweep formatVersion: ${String(report.formatVersion)}`);
  }
  if (!Array.isArray(report.slides) || !Array.isArray(report.issues)) {
    throw new Error('Deck sweep report needs slides[] and issues[].');
  }
  return report as unknown as DeckSweepReport;
}

/** Minimal static contact sheet (no external assets). */
export function renderDeckContactSheet(report: DeckSweepReport): string {
  const rows = report.slides
    .map((slide) => {
      const shot = slide.shot
        ? `<img src="${escapeAttr(slide.shot)}" alt="${escapeAttr(slide.slideId)} step ${slide.step}" width="320" />`
        : '<p class="muted">no shot</p>';
      const issues =
        slide.issues.length === 0
          ? '<span class="ok">ok</span>'
          : `<ul>${slide.issues
              .map(
                (entry) =>
                  `<li class="${entry.severity}">${escapeHtml(entry.code)}: ${escapeHtml(entry.message)}</li>`
              )
              .join('')}</ul>`;
      return `<article data-slide="${escapeAttr(slide.slideId)}" data-step="${slide.step}">
  <h2>${escapeHtml(slide.title || slide.slideId)} <small>step ${slide.step}</small></h2>
  ${shot}
  ${issues}
</article>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Deck sweep — ${escapeHtml(report.blueprint)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 1.5rem; background: #0b0b0c; color: #f4f4f5; }
    header { margin-bottom: 1.5rem; }
    .grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr)); }
    article { border: 1px solid #3f3f46; border-radius: 0.75rem; padding: 0.75rem; background: #18181b; }
    img { width: 100%; height: auto; border-radius: 0.5rem; background: #09090b; }
    .ok { color: #4ade80; }
    .error { color: #f87171; }
    .warning { color: #fbbf24; }
    .muted { color: #a1a1aa; }
    small { color: #a1a1aa; font-weight: 500; }
  </style>
</head>
<body>
  <header>
    <h1>Deck visual sweep</h1>
    <p class="muted">${escapeHtml(report.blueprint)} · ${report.errors} errors · ${report.warnings} warnings · ${escapeHtml(report.ok ? 'ok' : 'failed')}</p>
  </header>
  <div class="grid">
${rows}
  </div>
</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

/**
 * Extract the deck body and a stable visit plan (visible slide ids × steps)
 * from a kind:deck blueprint. Pure JSON walk — no schema import required.
 */
export function planDeckVisits(blueprint: unknown): {
  title: string;
  slides: Array<{ id: string; title: string; stepCount: number }>;
} {
  if (!blueprint || typeof blueprint !== 'object') {
    throw new Error('Blueprint must be an object.');
  }
  const root = blueprint as Record<string, unknown>;
  if (root.kind !== 'deck') {
    throw new Error(`Expected kind "deck", got ${JSON.stringify(root.kind)}.`);
  }
  const deck = root.deck;
  if (!deck || typeof deck !== 'object') throw new Error('Blueprint is missing deck body.');
  const body = deck as Record<string, unknown>;
  const slidesRaw = body.slides;
  if (!Array.isArray(slidesRaw) || slidesRaw.length === 0) {
    throw new Error('Deck has no slides.');
  }
  const slides = slidesRaw.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`slides[${index}] must be an object.`);
    }
    const slide = entry as Record<string, unknown>;
    const id = typeof slide.id === 'string' ? slide.id : '';
    if (!id) throw new Error(`slides[${index}] needs an id.`);
    const title = typeof slide.title === 'string' ? slide.title : id;
    const stepCount = estimateStepCount(slide);
    return { id, title, stepCount };
  });
  const title = typeof root.name === 'string' ? root.name : 'Deck';
  return { title, slides };
}

function estimateStepCount(slide: Record<string, unknown>): number {
  const steps = slide.steps;
  if (Array.isArray(steps) && steps.length > 0) return steps.length;
  // Count fragment markers in props/blocks (best-effort without full motion graph).
  let max = 0;
  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.step === 'number' && Number.isFinite(record.step)) {
      max = Math.max(max, Math.trunc(record.step) + 1);
    }
    for (const child of Object.values(record)) walk(child);
  };
  if ('props' in slide) walk(slide.props);
  if ('blocks' in slide) walk(slide.blocks);
  return Math.max(1, max);
}
