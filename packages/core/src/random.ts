/**
 * Deterministic randomness. Seeded worlds must never call `Math.random()`:
 * every generator receives an `Rng` derived from the scenario seed.
 *
 * mulberry32 is small, fast and good enough for fixtures (not for crypto).
 */

export interface Rng {
  /** The seed this generator was created with. */
  readonly seed: number;
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  float(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Picks using relative weights: `weighted([['a', 3], ['b', 1]])`. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
  shuffle<T>(items: readonly T[]): T[];
  sample<T>(items: readonly T[], count: number): T[];
  /** Independent child stream; stable for the same parent seed + label. */
  fork(label: string): Rng;
}

export function hashString(input: string): number {
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createRng(seed: number | string): Rng {
  const initial = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  let state = initial;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    seed: initial,
    next,
    int(min, max) {
      if (max < min) throw new RangeError(`int(): max (${max}) < min (${min})`);
      return min + Math.floor(next() * (max - min + 1));
    },
    float(min, max) {
      return min + next() * (max - min);
    },
    chance(p) {
      return next() < p;
    },
    pick(items) {
      if (items.length === 0) throw new RangeError('pick(): empty list');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    weighted(entries) {
      const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
      if (total <= 0) throw new RangeError('weighted(): weights must sum to > 0');
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= Math.max(0, weight);
        if (roll < 0) return value;
      }
      return (entries[entries.length - 1] as readonly [unknown, number])[0] as never;
    },
    shuffle(items) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j] as never, copy[i] as never];
      }
      return copy;
    },
    sample(items, count) {
      return rng.shuffle(items).slice(0, Math.max(0, count));
    },
    fork(label) {
      return createRng((initial ^ hashString(label)) >>> 0);
    },
  };
  return rng;
}

/**
 * Deterministic, human-readable ids for seeded entities: `deal_0007`.
 * Runtime-created entities use {@link createRuntimeId} instead.
 */
export interface IdFactory {
  next(prefix: string): string;
}

export function createIdFactory(pad = 4): IdFactory {
  const counters = new Map<string, number>();
  return {
    next(prefix) {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}_${String(n).padStart(pad, '0')}`;
    },
  };
}

/**
 * Ids for records created by the user at runtime. They are random by design
 * (documented in docs/SCENARIOS.md) and carry a `u` marker so they never
 * collide with seeded ids.
 */
export function createRuntimeId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_u${uuid.replace(/-/g, '').slice(0, 12)}`;
}
