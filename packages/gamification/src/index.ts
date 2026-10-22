/**
 * `@protoyard/gamification` — pure points ledger, levels, badges, missions,
 * ISO-week streaks and leaderboards for Protoyard prototypes (no Svelte).
 * Product-agnostic; callers supply catalogs and counts.
 */

export { badgeProgress } from './badges.ts';
export {
  type LeaderboardOptions,
  rankLeaderboard,
  verifiedPointsInWindow,
} from './leaderboard.ts';
export {
  appendPointsEntry,
  confirmProvisionalEntry,
  revertPointsBySource,
} from './ledger.ts';
export { levelFor } from './levels.ts';
export { missionProgress } from './missions.ts';
export { pointsTotals } from './points.ts';
export {
  type BadgeDef,
  BadgeDefSchema,
  type BadgeProgress,
  BadgeProgressSchema,
  DEFAULT_LEVEL_THRESHOLDS,
  type LeaderboardMember,
  LeaderboardMemberSchema,
  type LeaderboardRow,
  LeaderboardRowSchema,
  type LevelProgress,
  LevelProgressSchema,
  type MissionDef,
  MissionDefSchema,
  type MissionOptIn,
  MissionOptInSchema,
  type MissionProgress,
  MissionProgressSchema,
  type MonthKey,
  MonthKeySchema,
  type PointsEntry,
  type PointsEntryInput,
  PointsEntrySchema,
  type PointsTotals,
  PointsTotalsSchema,
} from './schemas.ts';
export {
  acceptMission,
  missionsFor,
  rankingOptInFromChoice,
} from './services.ts';
export { isoWeek, isPastDeadline, streakWeeks } from './time.ts';
