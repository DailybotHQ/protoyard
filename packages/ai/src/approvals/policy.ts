import {
  AUTONOMY_AREAS,
  type AutonomyArea,
  type AutonomyConfig,
  type AutonomyLevel,
  type PolicyMode,
} from './types.ts';

/**
 * What the loop may do for one action at the area's autonomy level.
 * `decide` clamps a stored level above that area's cap; `setLevel` refuses it.
 *
 * | Level | Mode |
 * | --- | --- |
 * | 1 Inform | inform |
 * | 2 Suggest | suggest |
 * | 3 Act with approval | act_with_approval |
 * | 4 Act within limits | act |
 */

/** Built-in actions mapped to default autonomy areas. */
export const AREA_OF_ACTION: Readonly<Record<string, string>> = {
  apply: 'records',
  notify: 'notifications',
  inform: 'workspace',
  message_external: 'external',
};

export const DEFAULT_AUTONOMY: AutonomyConfig = {
  levels: {
    records: 2,
    notifications: 2,
    workspace: 2,
    external: 2,
  },
  caps: { external: 3 },
};

const MODE: Record<AutonomyLevel, PolicyMode> = {
  1: 'inform',
  2: 'suggest',
  3: 'act_with_approval',
  4: 'act',
};

export const CAP_REASON = 'External messaging always asks first.';

export function modeForLevel(level: AutonomyLevel): PolicyMode {
  return MODE[level];
}

/** The area's level after the cap clamp. */
export function effectiveLevel(config: AutonomyConfig, area: string): AutonomyLevel {
  const level = config.levels[area];
  if (level === undefined) {
    throw new Error(`Unknown autonomy area: ${area}`);
  }
  const cap = config.caps[area];
  return cap !== undefined && level > cap ? cap : level;
}

/** Resolve the autonomy area for a policy action (or an explicit area). */
export function areaForAction(action: string, explicitArea?: string): string {
  if (explicitArea) return explicitArea;
  const mapped = AREA_OF_ACTION[action];
  if (mapped) return mapped;
  throw new Error(`Unknown policy action: ${action}`);
}

export function decide(config: AutonomyConfig, action: string, explicitArea?: string): PolicyMode {
  return MODE[effectiveLevel(config, areaForAction(action, explicitArea))];
}

export function isBuiltinAutonomyArea(value: string): value is (typeof AUTONOMY_AREAS)[number] {
  return (AUTONOMY_AREAS as readonly string[]).includes(value);
}

/**
 * Whether `area` is present in the config's levels map. Prototypes may add
 * custom areas by putting them on the config; built-in ids are always valid
 * once listed in levels.
 */
export function isConfiguredArea(config: AutonomyConfig, area: string): boolean {
  return Object.hasOwn(config.levels, area);
}

/**
 * A new config with one area changed. Throws `RangeError` when `level` is
 * outside 1–4 or above that area's cap, and `Error` for an unknown area.
 * The input config is not mutated.
 */
export function setLevel(config: AutonomyConfig, area: string, level: number): AutonomyConfig {
  if (!isConfiguredArea(config, area)) {
    throw new Error(`Unknown autonomy area: ${area}`);
  }
  if (level !== 1 && level !== 2 && level !== 3 && level !== 4) {
    throw new RangeError(`Autonomy level ${String(level)} is outside 1–4`);
  }
  const cap = config.caps[area];
  if (cap !== undefined && level > cap) {
    throw new RangeError(
      cap === 3 && area === 'external' ? CAP_REASON : `Level exceeds area cap ${String(cap)}`
    );
  }
  return { levels: { ...config.levels, [area]: level as AutonomyLevel }, caps: { ...config.caps } };
}

/**
 * Whether a side notification may go out. On the auto path, only Level 4 for
 * notifications; after a person confirms or approves, only Level 1 (inform)
 * drops it.
 */
export function notifyAllowed(config: AutonomyConfig, path: 'auto' | 'person'): boolean {
  const mode = decide(config, 'notify');
  return path === 'auto' ? mode === 'act' : mode !== 'inform';
}

export type { AutonomyArea };
