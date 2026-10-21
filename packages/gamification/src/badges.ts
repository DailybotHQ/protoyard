import type { BadgeDef, BadgeProgress } from './schemas.ts';

/**
 * Build badge progress rows from catalog definitions, per-badge counts and
 * the set of already-earned badge ids. Progress is capped at the goal.
 */
export function badgeProgress(
  defs: readonly BadgeDef[],
  counts: Readonly<Record<string, number>>,
  earnedIds: ReadonlySet<string>
): BadgeProgress[] {
  return defs.map((badge) => {
    const raw = counts[badge.id] ?? 0;
    const progress = Math.max(0, Math.min(Math.floor(raw), badge.goal));
    return {
      id: badge.id,
      name: badge.name,
      description: badge.description,
      earned: earnedIds.has(badge.id),
      progress,
      goal: badge.goal,
    };
  });
}
