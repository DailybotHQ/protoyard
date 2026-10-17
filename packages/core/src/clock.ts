/**
 * The simulation clock. Prototype code reads "now" from here, never from
 * `Date.now()`, so scenarios render the same world on every machine.
 *
 * Two distinct operations (docs/SCENARIOS.md → "Time"):
 *  - **Preview** (`setTime`, `previewOffset`) only moves the clock the UI sees.
 *    No data changes.
 *  - **Advance** is a scenario-controller operation that ALSO commits
 *    deterministic timeline events up to the new instant (idempotent through
 *    event ids + a checkpoint). The clock itself only records the instant.
 */

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

export interface Duration {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

export function durationToMs(duration: Duration): number {
  return (
    (duration.days ?? 0) * MS_PER_DAY +
    (duration.hours ?? 0) * MS_PER_HOUR +
    (duration.minutes ?? 0) * MS_PER_MINUTE +
    (duration.seconds ?? 0) * 1000
  );
}

export interface ClockState {
  /** ISO instant the scenario was generated against. */
  referenceTime: string;
  /** Committed offset from the reference (moves with `advance`). */
  committedOffsetMs: number;
  /** Extra preview-only offset on top of the committed instant. */
  previewOffsetMs: number;
  /** When true, `now()` follows wall-clock time from the effective instant. */
  running: boolean;
  /** Wall-clock ms when `running` was last enabled (internal). */
  runningSince?: number;
}

export interface SimulationClock {
  /** The effective simulated instant. */
  now(): Date;
  nowMs(): number;
  /** Scenario reference instant (time zero of the seeded world). */
  reference(): Date;
  /** The committed instant (reference + committed offset), without preview. */
  committed(): Date;
  /** True when a preview offset is active. */
  isPreviewing(): boolean;
  /** Preview-only: shows the UI at `date` without touching data. */
  setTime(date: Date | string): void;
  /** Preview-only: shifts the preview by a duration. */
  preview(duration: Duration): void;
  /** Drops the preview offset; back to the committed instant. */
  clearPreview(): void;
  /** Records a committed advance. Callers commit timeline events first. */
  commitAdvance(duration: Duration): void;
  /** Resets to the scenario reference time (no preview, no committed offset). */
  resetClock(): void;
  /** Helpers relative to the effective instant. */
  daysAgo(days: number): Date;
  daysFromNow(days: number): Date;
  getState(): ClockState;
  setState(state: ClockState): void;
  subscribe(listener: (state: ClockState) => void): () => void;
}

export function createSimulationClock(
  initial: Pick<ClockState, 'referenceTime'> & Partial<ClockState>,
  wallClock: () => number = () => Date.now()
): SimulationClock {
  const referenceMs = Date.parse(initial.referenceTime);
  if (Number.isNaN(referenceMs)) {
    throw new RangeError(`Invalid referenceTime: ${initial.referenceTime}`);
  }
  let state: ClockState = {
    referenceTime: initial.referenceTime,
    committedOffsetMs: initial.committedOffsetMs ?? 0,
    previewOffsetMs: initial.previewOffsetMs ?? 0,
    running: initial.running ?? false,
    ...(initial.runningSince !== undefined ? { runningSince: initial.runningSince } : {}),
  };
  const listeners = new Set<(state: ClockState) => void>();

  const emit = () => {
    for (const listener of listeners) listener(state);
  };
  const ref = () => Date.parse(state.referenceTime);
  const committedMs = () => ref() + state.committedOffsetMs;
  const effectiveMs = () => {
    const drift =
      state.running && state.runningSince !== undefined ? wallClock() - state.runningSince : 0;
    return committedMs() + state.previewOffsetMs + drift;
  };

  return {
    now: () => new Date(effectiveMs()),
    nowMs: effectiveMs,
    reference: () => new Date(ref()),
    committed: () => new Date(committedMs()),
    isPreviewing: () => state.previewOffsetMs !== 0,
    setTime(date) {
      const target = typeof date === 'string' ? Date.parse(date) : date.getTime();
      if (Number.isNaN(target)) throw new RangeError('setTime(): invalid date');
      state = { ...state, previewOffsetMs: target - committedMs() };
      emit();
    },
    preview(duration) {
      state = { ...state, previewOffsetMs: state.previewOffsetMs + durationToMs(duration) };
      emit();
    },
    clearPreview() {
      state = { ...state, previewOffsetMs: 0 };
      emit();
    },
    commitAdvance(duration) {
      const ms = durationToMs(duration);
      if (ms < 0) throw new RangeError('commitAdvance(): time only moves forward');
      state = { ...state, committedOffsetMs: state.committedOffsetMs + ms };
      emit();
    },
    resetClock() {
      state = {
        referenceTime: state.referenceTime,
        committedOffsetMs: 0,
        previewOffsetMs: 0,
        running: false,
      };
      emit();
    },
    daysAgo: (days) => new Date(effectiveMs() - days * MS_PER_DAY),
    daysFromNow: (days) => new Date(effectiveMs() + days * MS_PER_DAY),
    getState: () => ({ ...state }),
    setState(next) {
      state = { ...next };
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Time helpers bound to a fixed instant — used by seed generators. */
export interface TimeHelpers {
  /** The scenario reference instant. */
  now: Date;
  daysAgo(days: number, jitterHours?: number): Date;
  hoursAgo(hours: number): Date;
  daysFromNow(days: number): Date;
  /** Uniformly random instant between two dates (needs an rng). */
  between(from: Date, to: Date, next: () => number): Date;
  iso(date: Date): string;
}

export function createTimeHelpers(referenceTime: string | Date): TimeHelpers {
  const ref = typeof referenceTime === 'string' ? new Date(referenceTime) : referenceTime;
  const base = ref.getTime();
  return {
    now: new Date(base),
    daysAgo: (days, jitterHours = 0) =>
      new Date(base - days * MS_PER_DAY - jitterHours * MS_PER_HOUR),
    hoursAgo: (hours) => new Date(base - hours * MS_PER_HOUR),
    daysFromNow: (days) => new Date(base + days * MS_PER_DAY),
    between: (from, to, next) =>
      new Date(from.getTime() + next() * (to.getTime() - from.getTime())),
    iso: (date) => date.toISOString(),
  };
}
