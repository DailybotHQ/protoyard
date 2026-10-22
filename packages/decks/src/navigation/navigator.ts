/**
 * Pure deck navigation: next/prev walk steps then slides, skip hidden slides,
 * clamp out-of-range moves. No DOM.
 */

import type { Deck, DeckSlide } from '../schema/index.ts';
import { formatDeckHash, parseDeckHash } from './hash.ts';
import { defaultSlideStepCount, type SlideStepCountResolver } from './steps.ts';

/** Current place in the deck. */
export type DeckLocation = {
  /** Index into the full `deck.slides` array. */
  slideIndex: number;
  /** Slide id at `slideIndex`. */
  slideId: string;
  /** 0-based step on the current slide. */
  step: number;
  /** Step count on the current slide (≥ 1). */
  stepCount: number;
};

export type DeckNavigatorOptions = {
  /**
   * How many step positions each slide has. Defaults to
   * {@link defaultSlideStepCount} (length of `slide.steps`, min 1).
   */
  stepCount?: SlideStepCountResolver;
  /** Starting slide id (falls back to the first visible slide). */
  initialSlideId?: string;
  /** Starting step (clamped). */
  initialStep?: number;
};

export type DeckNavigator = {
  /** Current location (immutable snapshot). */
  getLocation(): DeckLocation;
  /** Visible (non-hidden) slides in deck order. */
  visibleSlides(): readonly DeckSlide[];
  /** Step count for a slide id (0 when unknown). */
  stepCountFor(slideId: string): number;
  /** Move to the first visible slide, step 0. */
  first(): DeckLocation;
  /** Move to the last visible slide, last step. */
  last(): DeckLocation;
  /**
   * Advance one step, or to the next visible slide's first step.
   * No-op at the end of the deck.
   */
  next(): DeckLocation;
  /**
   * Go back one step, or to the previous visible slide's last step.
   * No-op at the start of the deck.
   */
  prev(): DeckLocation;
  /**
   * Jump to a slide by id and optional step. Unknown or hidden ids fall back
   * to the first visible slide. Step is clamped to the slide's range.
   */
  goTo(slideId: string, step?: number): DeckLocation;
  /**
   * Jump by index among **visible** slides (0 = first visible). Out-of-range
   * indexes clamp. Step defaults to 0 and is clamped.
   */
  goToIndex(visibleIndex: number, step?: number): DeckLocation;
  /** `#/<slide-id>/<step>` for the current location. */
  toHash(): string;
  /**
   * Apply a hash string. Unknown ids fall back to the first visible slide;
   * malformed hashes leave the location unchanged and return null.
   */
  applyHash(raw: string | null | undefined): DeckLocation | null;
};

type Entry = {
  slide: DeckSlide;
  index: number;
  stepCount: number;
};

/**
 * Create a pure navigator over a validated deck. Hidden slides are skipped by
 * sequential moves; direct `goTo` of a hidden id falls back to the first
 * visible slide.
 */
export function createDeckNavigator(deck: Deck, options: DeckNavigatorOptions = {}): DeckNavigator {
  const resolveSteps = options.stepCount ?? defaultSlideStepCount;
  const entries: Entry[] = deck.slides.map((slide, index) => ({
    slide,
    index,
    stepCount: Math.max(1, Math.floor(resolveSteps(slide)) || 1),
  }));
  const byId = new Map(entries.map((entry) => [entry.slide.id, entry]));

  const visibleEntries = (): Entry[] => entries.filter((entry) => entry.slide.hidden !== true);

  const firstVisible = (): Entry => {
    const list = visibleEntries();
    const first = list[0] ?? entries[0];
    if (!first) {
      return { slide: entries[0]?.slide as DeckSlide, index: 0, stepCount: 1 };
    }
    return first;
  };

  let location: DeckLocation = initialLocation(
    entries,
    visibleEntries(),
    options.initialSlideId,
    options.initialStep
  );

  const get = (): DeckLocation => ({ ...location });

  const set = (entry: Entry, step: number): DeckLocation => {
    const clamped = clampStep(step, entry.stepCount);
    location = {
      slideIndex: entry.index,
      slideId: entry.slide.id,
      step: clamped,
      stepCount: entry.stepCount,
    };
    return get();
  };

  const navigator: DeckNavigator = {
    getLocation: get,
    visibleSlides: () => visibleEntries().map((entry) => entry.slide),
    stepCountFor(slideId) {
      return byId.get(slideId)?.stepCount ?? 0;
    },
    first() {
      return set(firstVisible(), 0);
    },
    last() {
      const list = visibleEntries();
      const entry = list.length > 0 ? list[list.length - 1] : firstVisible();
      if (!entry) return get();
      return set(entry, entry.stepCount - 1);
    },
    next() {
      const current = byId.get(location.slideId);
      if (!current) return set(firstVisible(), 0);
      if (location.step + 1 < current.stepCount) {
        return set(current, location.step + 1);
      }
      const list = visibleEntries();
      const at = list.findIndex((entry) => entry.slide.id === location.slideId);
      const nextEntry = at >= 0 ? list[at + 1] : undefined;
      if (nextEntry) return set(nextEntry, 0);
      return get();
    },
    prev() {
      const current = byId.get(location.slideId);
      if (!current) return set(firstVisible(), 0);
      if (location.step > 0) {
        return set(current, location.step - 1);
      }
      const list = visibleEntries();
      const at = list.findIndex((entry) => entry.slide.id === location.slideId);
      const prevEntry = at > 0 ? list[at - 1] : undefined;
      if (prevEntry) return set(prevEntry, prevEntry.stepCount - 1);
      return get();
    },
    goTo(slideId, step = 0) {
      const entry = byId.get(slideId);
      if (!entry || entry.slide.hidden === true) {
        return set(firstVisible(), 0);
      }
      return set(entry, step);
    },
    goToIndex(visibleIndex, step = 0) {
      const list = visibleEntries();
      if (list.length === 0) return set(firstVisible(), 0);
      const index = Math.max(0, Math.min(list.length - 1, Math.floor(visibleIndex)));
      const entry = list[index];
      if (!entry) return set(firstVisible(), 0);
      return set(entry, step);
    },
    toHash() {
      return formatDeckHash(location.slideId, location.step);
    },
    applyHash(raw) {
      const parsed = parseDeckHash(raw);
      if (!parsed) return null;
      return navigator.goTo(parsed.slideId, parsed.step);
    },
  };

  return navigator;
}

function clampStep(step: number, stepCount: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(stepCount - 1, Math.floor(step)));
}

function initialLocation(
  entries: Entry[],
  visible: Entry[],
  slideId: string | undefined,
  step: number | undefined
): DeckLocation {
  const fallback = visible[0] ?? entries[0];
  if (!fallback) {
    return { slideIndex: 0, slideId: '', step: 0, stepCount: 1 };
  }
  let target = fallback;
  if (slideId) {
    const match = entries.find((item) => item.slide.id === slideId && item.slide.hidden !== true);
    if (match) target = match;
  }
  return {
    slideIndex: target.index,
    slideId: target.slide.id,
    step: clampStep(step ?? 0, target.stepCount),
    stepCount: target.stepCount,
  };
}
