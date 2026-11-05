/**
 * `@protoyard/gamification-ui/ports` — the plain data the gamification kit
 * renders (ADR-046). The chips, badge, leaderboard and mission card take
 * these shapes and callbacks; a product maps its own points, ranks and goals
 * to them. No service or runtime is needed.
 */
export type { LeaderboardRow, MissionProgress } from '@protoyard/gamification';

/** The leaderboard's save path: return a promise for pending feedback. */
export type RankingOptInPort = (optIn: boolean) => unknown | Promise<unknown>;
/** A mission card's accept action: return a promise for pending feedback. */
export type MissionAcceptPort = (missionId: string) => unknown | Promise<unknown>;
