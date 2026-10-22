import { DEFAULT_LEVEL_THRESHOLDS, type LevelProgress } from './schemas.ts';

/**
 * Level for an amount of verified points. `thresholds[i]` is the floor of
 * level `i + 1`. Defaults match {@link DEFAULT_LEVEL_THRESHOLDS}.
 */
export function levelFor(
  verified: number,
  thresholds: readonly number[] = DEFAULT_LEVEL_THRESHOLDS
): LevelProgress {
  const floors = thresholds.length > 0 ? thresholds : DEFAULT_LEVEL_THRESHOLDS;
  const amount = Number.isFinite(verified) ? Math.max(0, Math.floor(verified)) : 0;
  let level = 1;
  for (let i = 0; i < floors.length; i += 1) {
    if (amount >= (floors[i] ?? 0)) level = i + 1;
  }
  const floor = floors[level - 1] ?? 0;
  const next = floors[level] ?? null;
  return {
    level,
    floor,
    next,
    missing: next === null ? 0 : Math.max(0, next - amount),
  };
}
