import { describe, expect, it } from 'vitest';
import {
  appendPointsEntry,
  confirmProvisionalEntry,
  type PointsEntry,
  pointsTotals,
  revertPointsBySource,
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

  it('appends, reverts by source, and confirms provisional rows without mutation', () => {
    const base: PointsEntry[] = [];
    const withOne = appendPointsEntry(base, {
      id: 'nrg-1',
      subjectId: 'user_0001',
      reason: 'commitment',
      amount: 10,
      provisional: true,
      reverted: false,
      sourceKind: 'offer',
      sourceId: 'o1',
      at: '2026-10-20T15:00:00.000Z',
    });
    expect(base).toHaveLength(0);
    expect(pointsTotals(withOne, 'user_0001')).toEqual({ verified: 0, provisional: 10 });

    const confirmed = confirmProvisionalEntry(withOne, 'nrg-1');
    expect(pointsTotals(confirmed, 'user_0001')).toEqual({ verified: 10, provisional: 0 });
    expect(withOne[0]?.provisional).toBe(true);

    const reverted = revertPointsBySource(confirmed, 'offer', 'o1');
    expect(pointsTotals(reverted, 'user_0001')).toEqual({ verified: 0, provisional: 0 });
    expect(confirmed[0]?.reverted).toBe(false);
  });

  it('rejects duplicate ids and invalid confirmations', () => {
    const one = appendPointsEntry([], {
      id: 'nrg-1',
      subjectId: 'user_0001',
      reason: 'help-confirmed',
      amount: 5,
      provisional: false,
      reverted: false,
      sourceKind: 'test',
      sourceId: 't',
      at: '2026-10-20T15:00:00.000Z',
    });
    expect(() =>
      appendPointsEntry(one, {
        id: 'nrg-1',
        subjectId: 'user_0001',
        reason: 'help-confirmed',
        amount: 5,
        provisional: false,
        reverted: false,
        sourceKind: 'test',
        sourceId: 't',
        at: '2026-10-20T15:00:00.000Z',
      })
    ).toThrow(/already exists/);
    expect(() => confirmProvisionalEntry(one, 'nrg-1')).toThrow(/not provisional/);
    expect(() => confirmProvisionalEntry(one, 'missing')).toThrow(/not found/);
  });
});
