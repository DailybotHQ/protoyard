import { missionProgress } from './missions.ts';
import {
  type MissionDef,
  type MissionOptIn,
  MissionOptInSchema,
  type MissionProgress,
} from './schemas.ts';
import { isPastDeadline } from './time.ts';

export type { MissionProgress };

/**
 * Service-style helpers: pure state transitions a prototype service can call
 * inside `environment.run` → `db.transaction`. They never touch IndexedDB.
 */

/**
 * Accept a mission for a subject. Idempotent when already accepted. Rejects
 * unknown mission ids and expired deadlines.
 */
export function acceptMission(
  defs: readonly MissionDef[],
  optIns: readonly MissionOptIn[],
  input: {
    id: string;
    subjectId: string;
    missionId: string;
    acceptedAt: string;
  }
): MissionOptIn[] {
  const mission = defs.find((row) => row.id === input.missionId);
  if (!mission) throw new Error(`unknown mission "${input.missionId}"`);
  const acceptedAt = Date.parse(input.acceptedAt);
  if (Number.isNaN(acceptedAt)) throw new Error('acceptedAt must be an ISO date-time');
  if (isPastDeadline(mission.deadlineAt, new Date(acceptedAt))) {
    throw new Error(`mission "${input.missionId}" is past its deadline`);
  }
  const existing = optIns.find(
    (row) => row.subjectId === input.subjectId && row.missionId === input.missionId
  );
  if (existing) return [...optIns];
  const row = MissionOptInSchema.parse(input);
  return [...optIns, row];
}

/** Flip ranking visibility for one member id (returns the new opt-in flag). */
export function rankingOptInFromChoice(optIn: boolean): boolean {
  if (typeof optIn !== 'boolean') throw new Error('ranking opt-in must be a boolean');
  return optIn;
}

/**
 * Convenience: missionsFor-shaped progress from defs, raw counts and opt-ins.
 */
export function missionsFor(
  defs: readonly MissionDef[],
  counts: Readonly<Record<string, number>>,
  optIns: readonly MissionOptIn[],
  subjectId: string,
  now: Date
): MissionProgress[] {
  const acceptedIds = new Set(
    optIns.filter((row) => row.subjectId === subjectId).map((row) => row.missionId)
  );
  return missionProgress(defs, counts, acceptedIds, now);
}
