import { DECK_LAYOUTS } from '@protoyard/decks';
import { type Deck, safeParseDeck } from '@protoyard/decks/schema';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DeckApp } from '../src/app/index.ts';

/*
 * A 200-slide deck (the schema maximum) through the real DeckApp and the real
 * lazy layout renderers, in happy-dom. It measures parse, first render and
 * every next/prev step, and checks that the DOM never holds more than the
 * current slide and its two neighbours. Run it on its own for numbers:
 *
 *   pnpm vitest run packages/decks-ui/tests/large-deck.perf.test.ts
 *
 * The thresholds are generous multiples of measured values (docs/PERFORMANCE.md),
 * so a loaded machine does not fail them, while a regression to rendering every
 * slide (hundreds of ms per step) does.
 */

/** Parse + first render of 200 slides. Measured 50–142 ms on 2026-10-22; see docs/PERFORMANCE.md. */
const FIRST_RENDER_BUDGET_MS = 1_000;
/** One next/prev step in happy-dom (the 60 fps frame). Applied to the median. */
const STEP_BUDGET_MS = 16;
/**
 * The p95 of ~200 steps catches the tail a loaded machine adds: a shared CI
 * runner measured a 6.88 ms median and a 21.82 ms p95 on 2026-10-22 while
 * other suites ran. It gets the same ceiling as a single jump. The 3-slide
 * window below is what fails at once if every slide renders.
 */
const STEP_P95_CEILING_MS = 50;
/**
 * A single Home or End jump is one sample, so a garbage-collection pause can
 * land on it (measured up to 12 ms once); it gets a ceiling instead of the
 * frame budget. Still far below rendering all 200 slides.
 */
const JUMP_CEILING_MS = 50;
const SLIDES = 200;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Deterministic fixture: every catalog layout in turn (with its sample), plus free slides. */
function largeDeck(): unknown {
  const catalog = DECK_LAYOUTS.filter((layout) => layout.id !== 'free');
  const slides = Array.from({ length: SLIDES }, (_, i) => {
    const id = `slide-${String(i + 1).padStart(3, '0')}`;
    if (i % 10 === 9) {
      return {
        id,
        title: `Free slide ${i + 1}`,
        layout: 'free',
        blocks: [
          { type: 'heading', text: `Section ${i + 1}` },
          { type: 'text', markdown: `Slide **${i + 1}** of a fictional review deck.` },
        ],
      };
    }
    const layout = catalog[i % catalog.length] as (typeof catalog)[number];
    return {
      id,
      title: `${layout.label} ${i + 1}`,
      layout: layout.id,
      props: structuredClone(layout.sample),
    };
  });
  return { style: { aspect: '16:9' }, slides };
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1)
  ] ?? 0;
const round = (n: number) => Math.round(n * 100) / 100;

const report: Record<string, number> = {};

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});
afterAll(() => {
  cleanup();
  vi.unstubAllGlobals();
  // Printed for docs/PERFORMANCE.md; never typed in by hand.
  console.info(`[large-deck] ${JSON.stringify(report)}`);
});

describe('a 200-slide deck', () => {
  let deck: Deck;
  let root: HTMLElement;

  const windowSize = () => root.querySelectorAll('[data-canvas-slide]').length;
  const activeSlideId = () =>
    root
      .querySelector('[data-canvas-slide]:not([aria-hidden="true"]) [data-py-deck-slide]')
      ?.getAttribute('data-py-deck-slide');

  it('parses and renders its first slide within budget', async () => {
    const input = largeDeck();
    const started = performance.now();
    const parsed = safeParseDeck(input);
    const parsedAt = performance.now();
    expect(parsed.issues).toEqual([]);
    deck = parsed.deck as Deck;
    expect(deck.slides).toHaveLength(SLIDES);

    const { container } = render(DeckApp, { deck, syncHash: false, autofocus: false });
    root = container.querySelector('[data-py-deck-app]') as HTMLElement;
    // First render is done when the active slide's layout chunk has loaded.
    await expect
      .poll(
        () =>
          root.querySelector(
            '[data-canvas-slide="0"] [role="status"][aria-label="Loading slide layout"]'
          ),
        {
          timeout: 5_000,
          interval: 5,
        }
      )
      .toBeNull();
    const renderedAt = performance.now();

    report.parseMs = round(parsedAt - started);
    report.firstRenderMs = round(renderedAt - parsedAt);
    report.parseAndFirstRenderMs = round(renderedAt - started);
    expect(report.parseAndFirstRenderMs).toBeLessThan(FIRST_RENDER_BUDGET_MS);
    expect(activeSlideId()).toBe('slide-001');
    expect(windowSize()).toBe(2);
  });

  it('steps through every slide and back within a frame, keeping a 3-slide DOM window', () => {
    const stepTimes: number[] = [];
    const step = (key: 'ArrowRight' | 'ArrowLeft') => {
      const t0 = performance.now();
      fireEvent.keyDown(root, { key });
      flushSync();
      stepTimes.push(performance.now() - t0);
      expect(windowSize()).toBeLessThanOrEqual(3);
    };

    for (let i = 1; i < SLIDES; i++) step('ArrowRight');
    expect(activeSlideId()).toBe(`slide-${SLIDES}`);
    expect(windowSize()).toBe(2);
    const forward = [...stepTimes];

    for (let i = 1; i < SLIDES; i++) step('ArrowLeft');
    expect(activeSlideId()).toBe('slide-001');
    const backward = stepTimes.slice(forward.length);

    // Mid-deck the window is exactly the current slide and its two neighbours.
    for (let i = 0; i < 50; i++) fireEvent.keyDown(root, { key: 'ArrowRight' });
    flushSync();
    expect(windowSize()).toBe(3);

    report.steps = stepTimes.length;
    report.nextMedianMs = round(median(forward));
    report.nextP95Ms = round(percentile(forward, 95));
    report.prevMedianMs = round(median(backward));
    report.prevP95Ms = round(percentile(backward, 95));
    report.stepMaxMs = round(Math.max(...stepTimes));
    expect(report.nextMedianMs).toBeLessThan(STEP_BUDGET_MS);
    expect(report.prevMedianMs).toBeLessThan(STEP_BUDGET_MS);
    expect(report.nextP95Ms).toBeLessThan(STEP_P95_CEILING_MS);
    expect(report.prevP95Ms).toBeLessThan(STEP_P95_CEILING_MS);
  });

  it('jumps to the last and first slide in one step', () => {
    for (const [key, expected] of [
      ['End', `slide-${SLIDES}`],
      ['Home', 'slide-001'],
    ] as const) {
      const t0 = performance.now();
      fireEvent.keyDown(root, { key });
      flushSync();
      report[`${key.toLowerCase()}Ms`] = round(performance.now() - t0);
      expect(activeSlideId()).toBe(expected);
      expect(windowSize()).toBe(2);
      expect(report[`${key.toLowerCase()}Ms`]).toBeLessThan(JUMP_CEILING_MS);
    }
  });
});
