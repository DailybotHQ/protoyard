import { createRng, isPersonaAvatar } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  AVATAR_COUNT,
  AVATAR_IDS,
  assignAvatars,
  createAvatarPool,
  isAvatarId,
  pickAvatar,
} from '../src/index.ts';

describe('seeded avatar assignment', () => {
  it('gives the same sequence for the same seed and a different one for another seed', () => {
    const a = assignAvatars(createRng(42), 40);
    const b = assignAvatars(createRng(42), 40);
    const c = assignAvatars(createRng(43), 40);
    expect(a).toEqual(b);
    expect(c).not.toEqual(a);
    const pool = createAvatarPool(createRng(42));
    expect(Array.from({ length: 40 }, () => pool.next())).toEqual(a);
  });

  it('works with forked streams, so a stable key gives stable faces', () => {
    const root = createRng('scenario:7');
    const first = assignAvatars(root.fork('app:avatars:team'), 10);
    root.next();
    root.next();
    expect(assignAvatars(root.fork('app:avatars:team'), 10)).toEqual(first);
    expect(assignAvatars(root.fork('app:avatars:guests'), 10)).not.toEqual(first);
  });

  it('never repeats within the first 175, then deals every id again', () => {
    for (const seed of [1, 42, 9001]) {
      const ids = assignAvatars(createRng(seed), AVATAR_COUNT * 2 + 10);
      const firstRound = ids.slice(0, AVATAR_COUNT);
      const secondRound = ids.slice(AVATAR_COUNT, AVATAR_COUNT * 2);
      expect(new Set(firstRound).size).toBe(AVATAR_COUNT);
      expect(new Set(secondRound).size).toBe(AVATAR_COUNT);
      expect([...firstRound].sort()).toEqual([...AVATAR_IDS]);
      // The reshuffle uses a new order and never repeats a face back to back.
      expect(secondRound).not.toEqual(firstRound);
      for (let i = 1; i < ids.length; i++) expect(ids[i], `index ${i}`).not.toBe(ids[i - 1]);
    }
  });

  it('returns only valid library ids that are valid persona avatars', () => {
    const ids = [
      ...assignAvatars(createRng(5), AVATAR_COUNT + 5),
      ...Array.from({ length: 50 }, (_, i) => pickAvatar(createRng(i))),
    ];
    for (const id of ids) {
      expect(isAvatarId(id), id).toBe(true);
      expect(isPersonaAvatar(id), id).toBe(true);
    }
  });

  it('deals avoided ids last in the first round', () => {
    const avoid = AVATAR_IDS.slice(0, 20);
    const ids = assignAvatars(createRng(11), AVATAR_COUNT, {
      avoid: [...avoid, 'not-an-id', null],
    });
    expect(new Set(ids).size).toBe(AVATAR_COUNT);
    expect(ids.slice(0, AVATAR_COUNT - 20).some((id) => avoid.includes(id))).toBe(false);
    expect([...ids.slice(AVATAR_COUNT - 20)].sort()).toEqual([...avoid]);
  });

  it('pickAvatar is deterministic and take(n) matches n calls to next()', () => {
    expect(pickAvatar(createRng(3))).toBe(pickAvatar(createRng(3)));
    const p1 = createAvatarPool(createRng(8));
    const p2 = createAvatarPool(createRng(8));
    expect(p1.take(5)).toEqual([p2.next(), p2.next(), p2.next(), p2.next(), p2.next()]);
    expect(p1.take(0)).toEqual([]);
  });

  it('rejects invalid counts', () => {
    expect(() => assignAvatars(createRng(1), -1)).toThrow(RangeError);
    expect(() => assignAvatars(createRng(1), 1.5)).toThrow(RangeError);
    expect(() => createAvatarPool(createRng(1)).take(Number.NaN)).toThrow(RangeError);
  });
});
