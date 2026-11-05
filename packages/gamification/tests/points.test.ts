import { describe, expect, it } from 'vitest';
import {
  acceptMission,
  type MissionDef,
  missionProgress,
  type PointsEntry,
  PointsEntrySchema,
  pointsTotals,
} from '../src/index.ts';

const entry = (amount: number, over: Partial<PointsEntry> = {}): PointsEntry => ({
  id: `e-${amount}-${over.reason ?? 'ok'}`,
  subjectId: 'user_0001',
  reason: 'help-confirmed',
  amount,
  provisional: false,
  reverted: false,
  sourceKind: 'confirmation',
  sourceId: 'c1',
  at: '2026-10-20T15:00:00.000Z',
  ...over,
});

describe('points ledger', () => {
  it('counts only verified non-reverted rows; provisional is separate', () => {
    const entries = [
      entry(110),
      entry(30, { id: 'e-30', reason: 'gift-received' }),
      entry(10, { id: 'e-p', provisional: true, reason: 'commitment' }),
      entry(10, {
        id: 'e-rev',
        provisional: true,
        reverted: true,
        reason: 'commitment',
      }),
      entry(99, { id: 'e-other', subjectId: 'user_0002' }),
    ];
    expect(pointsTotals(entries, 'user_0001')).toEqual({ verified: 140, provisional: 10 });
  });
});

// --- merged from schemas.test.ts ---

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
});

// --- merged from badges-missions.test.ts ---

const MISSIONS: readonly MissionDef[] = [
  {
    id: 'three-this-week',
    title: 'Help three people this week',
    description: 'Three confirmed helps Monday through Sunday.',
    goal: 3,
    reward: 30,
  },
  {
    id: 'publish-offer',
    title: 'Publish an offer',
    description: 'Share one offer of time or skills.',
    goal: 1,
    reward: 10,
    deadlineAt: '2026-10-15T00:00:00.000Z',
  },
];

describe('badges and missions', () => {
  it('rejects unknown missions and accepting after the deadline', () => {
    expect(() =>
      acceptMission(MISSIONS, [], {
        id: 'mop-x',
        subjectId: 'user_0001',
        missionId: 'missing',
        acceptedAt: '2026-10-20T12:00:00.000Z',
      })
    ).toThrow(/unknown mission/);
    expect(() =>
      acceptMission(MISSIONS, [], {
        id: 'mop-x',
        subjectId: 'user_0001',
        missionId: 'publish-offer',
        acceptedAt: '2026-10-20T12:00:00.000Z',
      })
    ).toThrow(/deadline/);
  });
});

describe('runtime ids and acceptance-free missions (UG-03)', () => {
  it('accepts runtime and seeded ids in ledger rows and still rejects bad ids', () => {
    // `createRuntimeId('pts')` and `ctx.ids.next('deal')` shapes.
    for (const id of ['pts_u0a1b2c3d4e5f', 'deal_0007', 'mission-complete']) {
      expect(PointsEntrySchema.safeParse(entry(5, { id })).success).toBe(true);
    }
    for (const id of ['Upper_case', '_lead', '9start', `a${'b'.repeat(64)}`]) {
      expect(PointsEntrySchema.safeParse(entry(5, { id })).success).toBe(false);
    }
  });

  it('completes a mission with requiresAcceptance false without an opt-in', () => {
    const defs: readonly MissionDef[] = [
      { ...MISSIONS[0]!, id: 'auto_help', requiresAcceptance: false },
      MISSIONS[0]!,
    ];
    const now = new Date('2026-10-20T12:00:00.000Z');
    const counts = { auto_help: 3, 'three-this-week': 3 };
    const [auto, manual] = missionProgress(defs, counts, new Set(), now);
    expect(auto).toMatchObject({ complete: true, accepted: false, requiresAcceptance: false });
    expect(manual).toMatchObject({ complete: false, accepted: false });
    expect(manual).not.toHaveProperty('requiresAcceptance');
  });
});
