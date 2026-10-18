import { z } from 'zod';
import { DeviceIdSchema, OrientationSchema } from './devices.ts';
import { EnvironmentPatchSchema } from './environment.ts';
import { ColorModeSchema, ShellSchema, ViewportPresetSchema } from './manifest.ts';

/**
 * State overrides are NON-destructive toggles layered on top of the loaded
 * scenario. They never touch domain records. Every effective value can report
 * where it came from so DevTools can show "value · source".
 */

export const ClockStateSchema = z.object({
  referenceTime: z.string(),
  committedOffsetMs: z.number().int(),
  previewOffsetMs: z.number().int(),
  running: z.boolean(),
  runningSince: z.number().optional(),
});

export const OverridesSchema = z
  .object({
    actorId: z.string().optional(),
    organizationId: z.string().optional(),
    role: z.string().optional(),
    themeId: z.string().optional(),
    mode: ColorModeSchema.optional(),
    reducedMotion: z.boolean().optional(),
    /** Spacing multiplier preview (compact 0.75 … comfortable 1.25). */
    density: z.number().min(0.75).max(1.25).optional(),
    viewport: ViewportPresetSchema.optional(),
    /** Presentation shell, device and orientation (ADR-016); never touch data. */
    shell: ShellSchema.optional(),
    device: DeviceIdSchema.optional(),
    orientation: OrientationSchema.optional(),
    environment: EnvironmentPatchSchema.optional(),
  })
  .strict();
export type Overrides = z.infer<typeof OverridesSchema>;

/**
 * Where an effective value comes from, in precedence order (highest first):
 * `override` (temporary DevTools toggle) → `preference` (the active persona's
 * persisted choice) → `scenario` (loaded scenario definition) → `default`
 * (prototype manifest / platform default).
 */
export type ValueSource = 'override' | 'preference' | 'scenario' | 'default';

export interface Effective<T> {
  value: T;
  source: ValueSource;
}

export function resolveEffective<T>(
  layers: { override?: T | undefined; preference?: T | undefined; scenario?: T | undefined },
  fallback: T
): Effective<T> {
  if (layers.override !== undefined) return { value: layers.override, source: 'override' };
  if (layers.preference !== undefined) return { value: layers.preference, source: 'preference' };
  if (layers.scenario !== undefined) return { value: layers.scenario, source: 'scenario' };
  return { value: fallback, source: 'default' };
}
