/** Injected simulated clock for the mock flow runtime. */

export interface MockClock {
  nowMs(): number;
  nowIso(): string;
  /** Advance by whole minutes (waits and delays). */
  advanceMinutes(minutes: number): void;
  set(ms: number): void;
}

export function toEpochMs(value: string | number | Date | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`Invalid clock value: ${String(value)}`);
    return value;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    if (Number.isNaN(ms)) throw new RangeError('Invalid clock Date');
    return ms;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new RangeError(`Invalid clock ISO: ${value}`);
  return ms;
}

/** Fixed default so tests without `now` still match across machines. */
export const DEFAULT_RUNTIME_NOW_MS = Date.parse('2026-03-15T10:00:00.000Z');

export function createMockClock(initial?: string | number | Date): MockClock {
  let ms = toEpochMs(initial, DEFAULT_RUNTIME_NOW_MS);
  return {
    nowMs: () => ms,
    nowIso: () => new Date(ms).toISOString(),
    advanceMinutes(minutes: number) {
      if (!Number.isFinite(minutes) || minutes < 0) {
        throw new RangeError(`Invalid advance minutes: ${String(minutes)}`);
      }
      ms += Math.floor(minutes) * 60_000;
    },
    set(next: number) {
      if (!Number.isFinite(next)) throw new RangeError(`Invalid clock set: ${String(next)}`);
      ms = next;
    },
  };
}
