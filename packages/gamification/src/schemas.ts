import { z } from 'zod';

/** Lowercase slug id (badges, missions, sources). */
const slugId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/, { message: 'ids are lowercase kebab-case' });

const isoInstant = z
  .string()
  .min(10)
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'must be an ISO date-time' });

const nonNegInt = z.number().int().nonnegative().max(1_000_000_000);

/**
 * One row in the points ledger. Verified totals ignore `provisional` and
 * `reverted` rows. Provisional live rows are "in progress" only.
 */
export const PointsEntrySchema = z
  .strictObject({
    id: slugId,
    /** Who the points belong to (persona id, member id, …). */
    subjectId: z.string().min(1).max(80),
    /** Short machine reason (`mission-complete`, `help-confirmed`, …). */
    reason: z.string().min(1).max(80),
    amount: z.number().int().min(-1_000_000).max(1_000_000),
    provisional: z.boolean(),
    reverted: z.boolean(),
    sourceKind: z.string().min(1).max(40),
    sourceId: z.string().min(1).max(80),
    at: isoInstant,
  })
  .readonly();
export type PointsEntry = z.infer<typeof PointsEntrySchema>;
export type PointsEntryInput = z.input<typeof PointsEntrySchema>;

export const PointsTotalsSchema = z
  .strictObject({
    verified: nonNegInt,
    provisional: nonNegInt,
  })
  .readonly();
export type PointsTotals = z.infer<typeof PointsTotalsSchema>;

/** Default level floors: level N starts at DEFAULT_LEVEL_THRESHOLDS[N - 1]. */
export const DEFAULT_LEVEL_THRESHOLDS = [
  0, 50, 100, 225, 400, 550, 675, 800, 950, 1100, 1300, 1500,
] as const;

export const LevelProgressSchema = z
  .strictObject({
    level: z.number().int().positive().max(10_000),
    floor: nonNegInt,
    /** Next threshold, or null at the top level. */
    next: nonNegInt.nullable(),
    /** Points still needed to reach `next` (0 at the top). */
    missing: nonNegInt,
  })
  .readonly();
export type LevelProgress = z.infer<typeof LevelProgressSchema>;

export const BadgeDefSchema = z
  .strictObject({
    id: slugId,
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(280),
    goal: z.number().int().positive().max(1_000_000),
  })
  .readonly();
export type BadgeDef = z.infer<typeof BadgeDefSchema>;

export const BadgeProgressSchema = z
  .strictObject({
    id: slugId,
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(280),
    earned: z.boolean(),
    progress: nonNegInt,
    goal: z.number().int().positive().max(1_000_000),
  })
  .readonly();
export type BadgeProgress = z.infer<typeof BadgeProgressSchema>;

export const MissionDefSchema = z
  .strictObject({
    id: slugId,
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(400),
    goal: z.number().int().positive().max(1_000_000),
    /** Points awarded when the mission completes (caller posts the ledger row). */
    reward: nonNegInt,
    /**
     * Optional exclusive end instant (ISO). After this time the mission is
     * expired: progress still reads, but it cannot be accepted or completed.
     */
    deadlineAt: isoInstant.optional(),
  })
  .readonly();
export type MissionDef = z.infer<typeof MissionDefSchema>;

export const MissionOptInSchema = z
  .strictObject({
    id: slugId,
    subjectId: z.string().min(1).max(80),
    missionId: slugId,
    acceptedAt: isoInstant,
  })
  .readonly();
export type MissionOptIn = z.infer<typeof MissionOptInSchema>;

export const MissionProgressSchema = z
  .strictObject({
    id: slugId,
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(400),
    goal: z.number().int().positive().max(1_000_000),
    reward: nonNegInt,
    deadlineAt: isoInstant.optional(),
    accepted: z.boolean(),
    progress: nonNegInt,
    complete: z.boolean(),
    expired: z.boolean(),
  })
  .readonly();
export type MissionProgress = z.infer<typeof MissionProgressSchema>;

export const LeaderboardMemberSchema = z
  .strictObject({
    subjectId: z.string().min(1).max(80),
    displayName: z.string().min(1).max(80),
    /** When false, the member is omitted from rankings. */
    rankingOptIn: z.boolean(),
  })
  .readonly();
export type LeaderboardMember = z.infer<typeof LeaderboardMemberSchema>;

export const LeaderboardRowSchema = z
  .strictObject({
    subjectId: z.string().min(1).max(80),
    displayName: z.string().min(1).max(80),
    points: nonNegInt,
    position: z.number().int().positive().max(1_000_000),
  })
  .readonly();
export type LeaderboardRow = z.infer<typeof LeaderboardRowSchema>;

/** Calendar month key `YYYY-MM`. */
export const MonthKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' });
export type MonthKey = z.infer<typeof MonthKeySchema>;
