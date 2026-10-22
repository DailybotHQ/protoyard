/**
 * Guided tour model for player and DevTools.
 *
 * Pure data and helpers only: no DOM, no clock mutation, no runtime imports.
 * A step may declare an absolute story day; advancing to it produces a clock
 * request that callers fulfill through `runtime.scenarios.advance`.
 */

/** One explicit beat in a tour. */
export interface TourStep {
  /** Stable id within the tour (used in requests and tests). */
  id: string;
  /** Short heading shown in the player. */
  title: string;
  /** Body copy for the step. */
  body: string;
  /**
   * Optional CSS selector for a highlight target. When the element is absent
   * the tour still advances; the player simply skips the spotlight.
   */
  target?: string;
  /**
   * Absolute story day this step reaches (integer ≥ 0). Day 0 is the tour
   * start before any advance. When the controller moves forward to this step
   * it requests `days = step.day - previousDay` (never negative).
   */
  day?: number;
}

/** A named sequence of steps. */
export interface TourDefinition {
  id: string;
  title: string;
  /** Non-empty ordered list of steps. */
  steps: readonly TourStep[];
}

/** Lifecycle of a running tour session. */
export type TourStatus = 'idle' | 'active' | 'completed' | 'dismissed';

/** Snapshot of where the session sits. */
export interface TourState {
  tourId: string;
  status: TourStatus;
  /** Index into `steps`, or `-1` when idle/dismissed with no current step. */
  stepIndex: number;
  /** Highest absolute story day reached (from step `day` values). */
  storyDay: number;
}

/**
 * Clock work the controller asks the host to perform. The host must call the
 * public scenario API (`runtime.scenarios.advance({ days })`); the tour never
 * mutates the simulation clock itself.
 */
export interface ClockAdvanceRequest {
  /** Positive day count to advance. */
  days: number;
  /** Story day before the advance. */
  fromDay: number;
  /** Story day after the advance (the step's declared day). */
  toDay: number;
  /** Step that triggered the request. */
  stepId: string;
  /** Tour that owns the step. */
  tourId: string;
}

export class TourDefinitionError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`Invalid tour definition: ${issues.join('; ')}`);
    this.name = 'TourDefinitionError';
    this.issues = issues;
  }
}

/** Normalize and validate a tour definition. Throws `TourDefinitionError`. */
export function parseTourDefinition(input: TourDefinition): TourDefinition {
  const issues: string[] = [];
  if (!input || typeof input !== 'object') {
    throw new TourDefinitionError(['definition must be an object']);
  }
  if (typeof input.id !== 'string' || input.id.trim() === '') {
    issues.push('id is required');
  }
  if (typeof input.title !== 'string' || input.title.trim() === '') {
    issues.push('title is required');
  }
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    issues.push('steps must be a non-empty array');
  }

  const seen = new Set<string>();
  let lastDay = 0;
  const steps: TourStep[] = [];

  for (let i = 0; i < (input.steps?.length ?? 0); i++) {
    const raw = input.steps[i];
    const label = `steps[${i}]`;
    if (!raw || typeof raw !== 'object') {
      issues.push(`${label} must be an object`);
      continue;
    }
    if (typeof raw.id !== 'string' || raw.id.trim() === '') {
      issues.push(`${label}.id is required`);
      continue;
    }
    if (seen.has(raw.id)) {
      issues.push(`${label}.id "${raw.id}" is duplicated`);
    }
    seen.add(raw.id);
    if (typeof raw.title !== 'string' || raw.title.trim() === '') {
      issues.push(`${label}.title is required`);
    }
    if (typeof raw.body !== 'string') {
      issues.push(`${label}.body must be a string`);
    }
    let day: number | undefined;
    if (raw.day !== undefined) {
      if (typeof raw.day !== 'number' || !Number.isFinite(raw.day) || !Number.isInteger(raw.day)) {
        issues.push(`${label}.day must be a finite integer`);
      } else if (raw.day < 0) {
        issues.push(`${label}.day must be ≥ 0`);
      } else if (raw.day < lastDay) {
        issues.push(`${label}.day (${raw.day}) must be ≥ previous day (${lastDay})`);
      } else {
        day = raw.day;
        lastDay = raw.day;
      }
    }
    if (raw.target !== undefined && typeof raw.target !== 'string') {
      issues.push(`${label}.target must be a string when set`);
    }
    steps.push({
      id: raw.id,
      title: raw.title,
      body: raw.body ?? '',
      ...(typeof raw.target === 'string' && raw.target.trim() !== '' ? { target: raw.target } : {}),
      ...(day !== undefined ? { day } : {}),
    });
  }

  if (issues.length > 0) throw new TourDefinitionError(issues);

  return {
    id: input.id.trim(),
    title: input.title.trim(),
    steps,
  };
}

/** Absolute story day for a step index (0 when the step omits `day`). */
export function stepDay(steps: readonly TourStep[], index: number): number {
  if (index < 0 || index >= steps.length) return 0;
  const step = steps[index];
  if (!step || step.day === undefined) {
    // Inherit the nearest earlier declared day so omitted days stay flat.
    for (let i = index - 1; i >= 0; i--) {
      const earlier = steps[i];
      if (earlier?.day !== undefined) return earlier.day;
    }
    return 0;
  }
  return step.day;
}

/**
 * Build the clock request for moving from one step index to a later one.
 * Returns `null` when no positive day delta is required (same day, backward,
 * or out of range).
 */
export function clockRequestForAdvance(
  tour: TourDefinition,
  fromIndex: number,
  toIndex: number
): ClockAdvanceRequest | null {
  if (toIndex <= fromIndex || toIndex < 0 || toIndex >= tour.steps.length) return null;
  const fromDay = fromIndex < 0 ? 0 : stepDay(tour.steps, fromIndex);
  const toDay = stepDay(tour.steps, toIndex);
  const days = toDay - fromDay;
  if (!(days > 0)) return null;
  const step = tour.steps[toIndex];
  if (!step) return null;
  return {
    days,
    fromDay,
    toDay,
    stepId: step.id,
    tourId: tour.id,
  };
}

/**
 * Resolve a CSS selector against a root without throwing. Invalid selectors
 * and missing elements both return `null` so tours stay safe when a target
 * is absent or the host document has changed.
 */
export function resolveTourTarget(
  selector: string | undefined,
  root: ParentNode | null | undefined = typeof document !== 'undefined' ? document : null
): Element | null {
  if (!selector || selector.trim() === '' || !root) return null;
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

/** Initial idle state for a parsed tour. */
export function initialTourState(tourId: string): TourState {
  return {
    tourId,
    status: 'idle',
    stepIndex: -1,
    storyDay: 0,
  };
}
