import { AVATAR_IDS, type AvatarId, isAvatarId } from './index.ts';

/**
 * Seeded avatar assignment. "Random" faces stay reproducible: every picker
 * draws only from the rng it is given (a generator's `ctx.rng`, ideally a
 * `ctx.rng.fork('<stable key>')`), never from `Math.random()` or the clock,
 * so the same seed always gives the same faces.
 */

/**
 * The slice of `@protoyard/core`'s `Rng` the pickers use. It is structural, so
 * `ctx.rng` and `createRng(seed)` fit as they are and this package stays free
 * of dependencies.
 */
export interface AvatarRng {
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

/** One avatar id, uniformly at random from the library. Repeats are possible across calls. */
export function pickAvatar(rng: AvatarRng): AvatarId {
  return rng.pick(AVATAR_IDS);
}

export interface AvatarPoolOptions {
  /**
   * Ids already in use (for example the team's faces when a later generator
   * adds invitees). They are dealt last in the first round, so new people get
   * fresh faces until the library runs out. Unknown values are ignored.
   */
  avoid?: Iterable<unknown>;
}

export interface AvatarPool {
  /** The next id. No id repeats until all 175 were dealt; then the library is reshuffled. */
  next(): AvatarId;
  /** The next `count` ids, as from `count` calls to {@link AvatarPool.next}. */
  take(count: number): AvatarId[];
}

function requireCount(count: number): number {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError(`Avatar count must be a non-negative integer, got ${String(count)}`);
  }
  return count;
}

/**
 * A shuffled deck of every avatar id. Deterministic for the same rng state:
 * create one per world (or per generator, from a forked rng) and call
 * `next()` for each person.
 */
export function createAvatarPool(rng: AvatarRng, options: AvatarPoolOptions = {}): AvatarPool {
  const avoid = new Set<AvatarId>();
  for (const value of options.avoid ?? []) if (isAvatarId(value)) avoid.add(value);

  let deck: AvatarId[] = [];
  let index = 0;
  let round = 0;
  let last: AvatarId | undefined;

  const deal = () => {
    if (round === 0 && avoid.size > 0) {
      deck = [
        ...rng.shuffle(AVATAR_IDS.filter((id) => !avoid.has(id))),
        ...rng.shuffle(AVATAR_IDS.filter((id) => avoid.has(id))),
      ];
    } else {
      deck = rng.shuffle(AVATAR_IDS);
    }
    // Never hand out the same face twice in a row across a reshuffle.
    if (deck.length > 1 && deck[0] === last) {
      [deck[0], deck[1]] = [deck[1] as AvatarId, deck[0] as AvatarId];
    }
    index = 0;
    round++;
  };

  const next = (): AvatarId => {
    if (index >= deck.length) deal();
    const id = deck[index++] as AvatarId;
    last = id;
    return id;
  };

  return {
    next,
    take(count) {
      return Array.from({ length: requireCount(count) }, next);
    },
  };
}

/**
 * `count` avatar ids with no repeats among the first 175 (then the library
 * cycles in a new order). Same rng state, same ids.
 */
export function assignAvatars(
  rng: AvatarRng,
  count: number,
  options: AvatarPoolOptions = {}
): AvatarId[] {
  return createAvatarPool(rng, options).take(requireCount(count));
}
