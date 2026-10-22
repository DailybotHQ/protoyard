/** Small deterministic helpers (no Math.random, no Date.now). */

export function hashSeed(seed: number | string | undefined): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return seed >>> 0;
  }
  const text = seed === undefined ? 'flows' : String(seed);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 — same stream for the same seed. */
export function createRng(seed: number | string | undefined): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createIdFactory(seed: number | string | undefined) {
  const prefixSeed = hashSeed(seed).toString(36);
  let n = 0;
  return (prefix: string) => {
    n += 1;
    return `${prefix}_${prefixSeed}_${String(n).padStart(4, '0')}`;
  };
}

/** Fisher–Yates with an injected rng. */
export function shuffleInPlace<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const left = items[i];
    const right = items[j];
    if (left === undefined || right === undefined) continue;
    items[i] = right;
    items[j] = left;
  }
  return items;
}
