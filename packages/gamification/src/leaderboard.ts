import type { LeaderboardMember, LeaderboardRow, MonthKey, PointsEntry } from './schemas.ts';
import { MonthKeySchema } from './schemas.ts';

export interface LeaderboardOptions {
  /** Restrict verified points to this calendar month (`YYYY-MM`). */
  month?: MonthKey;
}

/**
 * Verified (non-provisional, non-reverted) points for one subject, optionally
 * limited to a calendar month on `entry.at`.
 */
export function verifiedPointsInWindow(
  entries: readonly PointsEntry[],
  subjectId: string,
  month?: MonthKey
): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.subjectId !== subjectId || entry.provisional || entry.reverted) continue;
    if (month !== undefined && entry.at.slice(0, 7) !== month) continue;
    total += entry.amount;
  }
  return Math.max(0, total);
}

/**
 * Rank members who opted in. Ties break on `subjectId` ascending so the order
 * is stable. Callers supply display names; this function never invents them.
 */
export function rankLeaderboard(
  members: readonly LeaderboardMember[],
  entries: readonly PointsEntry[],
  options: LeaderboardOptions = {}
): LeaderboardRow[] {
  const month = options.month === undefined ? undefined : MonthKeySchema.parse(options.month);
  const eligible = members.filter((member) => member.rankingOptIn);
  const rows = eligible
    .map((member) => ({
      subjectId: member.subjectId,
      displayName: member.displayName,
      points: verifiedPointsInWindow(entries, member.subjectId, month),
    }))
    .sort(
      (left, right) => right.points - left.points || left.subjectId.localeCompare(right.subjectId)
    );
  return rows.map((row, index) => ({ ...row, position: index + 1 }));
}
