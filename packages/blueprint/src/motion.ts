import { z } from 'zod';

/**
 * The blueprint `motion` block: a closed, optional vocabulary for how much a
 * prototype animates. It mirrors the envelope motion of the Texuli spec
 * (`{ level }`, spec 0.6) and maps one to one onto the `texuli/motion`
 * `MotionProvider` level, which the player and generated prototypes render
 * with. Agents name a level; nothing here is CSS, keyframes or milliseconds,
 * and unknown keys or values are refused.
 *
 * Optional and additive to formatVersion 1: a blueprint without `motion`
 * parses, hashes (content identity) and generates exactly as before.
 *
 * - `full`: every Texuli animation plays (the default).
 * - `subtle`: shorter animations with no travel or scale.
 * - `none`: no animation; every change is instant.
 *
 * The reader's `prefers-reduced-motion` and the prototype's reduced-motion
 * setting still win: a level is a ceiling, never a way to force motion on.
 */

/** The motion levels, highest first (the same names as `texuli/motion`'s `MOTION_LEVEL_NAMES`). */
export const BLUEPRINT_MOTION_LEVELS = ['full', 'subtle', 'none'] as const;
export type BlueprintMotionLevel = (typeof BLUEPRINT_MOTION_LEVELS)[number];

/** The level a blueprint without `motion` (or without `motion.level`) plays at. */
export const DEFAULT_BLUEPRINT_MOTION_LEVEL: BlueprintMotionLevel = 'full';

export const BlueprintMotionSchema = z.strictObject({
  /** How much the prototype animates: `full` (default), `subtle` or `none`. */
  level: z.enum(BLUEPRINT_MOTION_LEVELS),
});
export type BlueprintMotion = z.infer<typeof BlueprintMotionSchema>;

export function isBlueprintMotionLevel(value: unknown): value is BlueprintMotionLevel {
  return (
    typeof value === 'string' && (BLUEPRINT_MOTION_LEVELS as readonly string[]).includes(value)
  );
}

/** The motion level of any parsed blueprint (`full` when it declares none). */
export function blueprintMotionLevel(blueprint: {
  readonly motion?: BlueprintMotion | undefined;
}): BlueprintMotionLevel {
  const level = blueprint.motion?.level;
  return isBlueprintMotionLevel(level) ? level : DEFAULT_BLUEPRINT_MOTION_LEVEL;
}

/** The lower of two levels (`none` < `subtle` < `full`): a ceiling only ever lowers. */
export function lowerMotionLevel(
  a: BlueprintMotionLevel,
  b: BlueprintMotionLevel
): BlueprintMotionLevel {
  return BLUEPRINT_MOTION_LEVELS.indexOf(a) >= BLUEPRINT_MOTION_LEVELS.indexOf(b) ? a : b;
}

/**
 * A deck with the blueprint's motion level as a ceiling on its own
 * `style.motion` (slide transitions and fragments). Returns the same object
 * when nothing changes, so a deck without a lower blueprint level keeps its
 * identity (and Svelte does not re-render it).
 */
export function deckWithMotionCeiling<
  D extends { readonly style?: { readonly motion?: BlueprintMotionLevel | undefined } | undefined },
>(deck: D, level: BlueprintMotionLevel): D {
  const own = deck.style?.motion ?? DEFAULT_BLUEPRINT_MOTION_LEVEL;
  const effective = lowerMotionLevel(own, level);
  if (effective === own) return deck;
  return { ...deck, style: { ...deck.style, motion: effective } };
}
