import { describe, expect, it } from 'vitest';
import {
  type LeaderboardMember,
  type PointsEntry,
  rankingOptInFromChoice,
  rankLeaderboard,
} from '../src/index.ts';

const members: LeaderboardMember[] = [
  { subjectId: 'user_a', displayName: 'Ada', rankingOptIn: true },
  { subjectId: 'user_b', displayName: 'Bea', rankingOptIn: true },
  { subjectId: 'user_c', displayName: 'Cara', rankingOptIn: false },
];

const entry = (
  id: string,
  subjectId: string,
  amount: number,
  at: string,
  over: Partial<PointsEntry> = {}
): PointsEntry => ({
  id,
  subjectId,
  reason: 'help-confirmed',
  amount,
  provisional: false,
  reverted: false,
  sourceKind: 'test',
  sourceId: id,
  at,
  ...over,
});

describe('leaderboard', () => {
  it('ranks only opted-in members on verified points for the requested month', () => {
    const entries: PointsEntry[] = [
      entry('a-oct', 'user_a', 10, '2026-10-05T00:00:00.000Z'),
      entry('a-sep', 'user_a', 50, '2026-09-20T00:00:00.000Z'),
      entry('b-oct', 'user_b', 100, '2026-10-05T00:00:00.000Z'),
      entry('a-pending', 'user_a', 25, '2026-10-05T00:00:00.000Z', {
        provisional: true,
        reason: 'commitment',
      }),
      entry('c-oct', 'user_c', 999, '2026-10-05T00:00:00.000Z'),
    ];

    expect(rankLeaderboard(members, entries, { month: '2026-10' })).toEqual([
      { subjectId: 'user_b', displayName: 'Bea', points: 100, position: 1 },
      { subjectId: 'user_a', displayName: 'Ada', points: 10, position: 2 },
    ]);

    const hidden = members.map((member) =>
      member.subjectId === 'user_a'
        ? { ...member, rankingOptIn: rankingOptInFromChoice(false) }
        : member
    );
    expect(rankLeaderboard(hidden, entries, { month: '2026-10' })).toEqual([
      { subjectId: 'user_b', displayName: 'Bea', points: 100, position: 1 },
    ]);
  });

  it('breaks ties on subjectId and rejects a bad month key', () => {
    const entries: PointsEntry[] = [
      entry('a', 'user_a', 10, '2026-10-01T00:00:00.000Z'),
      entry('b', 'user_b', 10, '2026-10-01T00:00:00.000Z'),
    ];
    expect(
      rankLeaderboard(members, entries, { month: '2026-10' }).map((row) => row.subjectId)
    ).toEqual(['user_a', 'user_b']);
    expect(() => rankLeaderboard(members, entries, { month: '2026-13' as '2026-10' })).toThrow();
  });
});
