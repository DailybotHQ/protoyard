import type { MissionDef, MissionProgress } from './schemas.ts';
import { isPastDeadline } from './time.ts';

/**
 * Build mission progress rows. Progress is capped at the goal. A mission is
 * complete when accepted (or its definition sets `requiresAcceptance: false`),
 * not expired, and progress >= goal.
 */
export function missionProgress(
  defs: readonly MissionDef[],
  counts: Readonly<Record<string, number>>,
  acceptedIds: ReadonlySet<string>,
  now: Date
): MissionProgress[] {
  return defs.map((mission) => {
    const raw = counts[mission.id] ?? 0;
    const progress = Math.max(0, Math.min(Math.floor(raw), mission.goal));
    const expired = isPastDeadline(mission.deadlineAt, now);
    const accepted = acceptedIds.has(mission.id);
    const needsAcceptance = mission.requiresAcceptance !== false;
    const complete = (accepted || !needsAcceptance) && !expired && progress >= mission.goal;
    return {
      id: mission.id,
      title: mission.title,
      description: mission.description,
      goal: mission.goal,
      reward: mission.reward,
      ...(mission.deadlineAt !== undefined ? { deadlineAt: mission.deadlineAt } : {}),
      ...(needsAcceptance ? {} : { requiresAcceptance: false }),
      accepted,
      progress,
      complete,
      expired,
    };
  });
}
