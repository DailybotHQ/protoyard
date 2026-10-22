import type { PointsEntry, PointsTotals } from './schemas.ts';

/**
 * Sum verified and provisional points for one subject. Reverted rows never
 * count. Provisional live rows only feed the provisional total.
 */
export function pointsTotals(entries: readonly PointsEntry[], subjectId: string): PointsTotals {
  let verified = 0;
  let provisional = 0;
  for (const entry of entries) {
    if (entry.subjectId !== subjectId || entry.reverted) continue;
    if (entry.provisional) provisional += entry.amount;
    else verified += entry.amount;
  }
  return {
    verified: Math.max(0, verified),
    provisional: Math.max(0, provisional),
  };
}
