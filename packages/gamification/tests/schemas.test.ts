import { describe, expect, it } from 'vitest';
import { BadgeDefSchema, MissionDefSchema, PointsEntrySchema } from '../src/index.ts';

describe('gamification schemas', () => {
  it('accepts a valid points entry and rejects unknown keys', () => {
    const parsed = PointsEntrySchema.parse({
      id: 'nrg-1',
      subjectId: 'user_0001',
      reason: 'help-confirmed',
      amount: 10,
      provisional: false,
      reverted: false,
      sourceKind: 'confirmation',
      sourceId: 'c1',
      at: '2026-10-20T15:00:00.000Z',
    });
    expect(parsed.amount).toBe(10);
    expect(PointsEntrySchema.safeParse({ ...parsed, extra: true }).success).toBe(false);
  });

  it('requires positive badge goals and mission rewards bounds', () => {
    expect(
      BadgeDefSchema.safeParse({
        id: 'first-help',
        name: 'First help',
        description: 'One help.',
        goal: 0,
      }).success
    ).toBe(false);
    expect(
      MissionDefSchema.parse({
        id: 'three-this-week',
        title: 'Help three',
        description: 'Three helps.',
        goal: 3,
        reward: 30,
      }).reward
    ).toBe(30);
  });
});
