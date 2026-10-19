import { z } from 'zod';
import { DeviceIdSchema, OrientationSchema } from './devices.ts';
import { EnvironmentPatchSchema, SubscriptionStatusSchema } from './environment.ts';
import { ColorModeSchema, type Shell, ShellSchema, ViewportPresetSchema } from './manifest.ts';

/**
 * A scenario answers: "what does this app look like for THIS actor, in THIS
 * organization, after THIS much time, with THESE permissions, this much data
 * and these conditions?" Every axis is independent and composable.
 *
 * The platform never assumes domain entities: `density`/`activity` are
 * interpreted by each prototype's generator ("few records" may mean tasks,
 * messages or orders).
 */

export const DataDensitySchema = z.enum(['empty', 'sparse', 'normal', 'dense', 'massive']);
export type DataDensity = z.infer<typeof DataDensitySchema>;

export const ActivityLevelSchema = z.enum([
  'none',
  'low',
  'normal',
  'intense',
  'dormant',
  'reactivated',
]);
export type ActivityLevel = z.infer<typeof ActivityLevelSchema>;

export const ScenarioOrganizationSchema = z.object({
  id: z.string().default('org_0001'),
  name: z.string().optional(),
  ageDays: z.number().int().min(0).default(0),
  size: z.number().int().min(1).default(1),
  subscription: SubscriptionStatusSchema.default('free'),
  type: z.string().optional(),
  featureFlags: z.record(z.string(), z.boolean()).default({}),
});

export const ScenarioActorSchema = z.object({
  /** Persona id the session starts as. Generators must create it. */
  id: z.string().default('user_0001'),
  role: z.string().default('owner'),
  /** Actor tenure — independent from organization age. */
  joinedDaysAgo: z.number().int().min(0).default(0),
  onboardingComplete: z.boolean().default(true),
  /** 0..1 for partially completed onboarding flows. */
  onboardingProgress: z.number().min(0).max(1).optional(),
  locale: z.string().default('en-US'),
});

export const ScenarioAppearanceSchema = z.object({
  themeId: z.string().optional(),
  mode: ColorModeSchema.optional(),
  reducedMotion: z.boolean().optional(),
  viewport: ViewportPresetSchema.optional(),
  shell: ShellSchema.optional(),
  device: DeviceIdSchema.optional(),
  orientation: OrientationSchema.optional(),
});

export const ScenarioSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, { message: 'scenario id must be kebab-case' }),
  /** Bump when the scenario definition changes meaningfully. */
  version: z.number().int().positive().default(1),
  name: z.string().min(1),
  description: z.string().default(''),
  /** Groups scenarios in DevTools: lifecycle, roles, billing, conditions… */
  group: z.string().default('General'),
  /** Optional preset this scenario extends (merged before validation). */
  extends: z.string().optional(),
  seed: z.number().int().nonnegative(),
  /** ISO 8601 instant with offset. Time zero of the seeded world. */
  referenceTime: z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
    message: 'referenceTime must be an ISO 8601 date',
  }),
  organization: ScenarioOrganizationSchema.default({
    id: 'org_0001',
    ageDays: 0,
    size: 1,
    subscription: 'free',
    featureFlags: {},
  }),
  actor: ScenarioActorSchema.default({
    id: 'user_0001',
    role: 'owner',
    joinedDaysAgo: 0,
    onboardingComplete: true,
    locale: 'en-US',
  }),
  density: DataDensitySchema.default('normal'),
  activity: z.object({ level: ActivityLevelSchema.default('normal') }).default({ level: 'normal' }),
  environment: EnvironmentPatchSchema.default({}),
  appearance: ScenarioAppearanceSchema.default({}),
  /** Prototype-specific knobs, passed untouched to the generator. */
  generators: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioInput = z.input<typeof ScenarioSchema>;

/**
 * A scenario that inherits from another scenario or a preset: everything but
 * `id` and `extends` is optional and deep-merged over the parent by the
 * runtime (`resolveScenarios` in @protoyard/scenarios).
 */
export type ScenarioExtension = Partial<Omit<ScenarioInput, 'id' | 'extends'>> & {
  id: string;
  extends: string;
};

/** What prototypes declare: a full scenario or an extension of another one. */
export type ScenarioDefinition = ScenarioInput | ScenarioExtension;

/** Identity helper with good inference for authoring scenarios in TS. */
export function defineScenario<const T extends ScenarioDefinition>(scenario: T): T {
  return scenario;
}

export function parseScenario(input: unknown): Scenario {
  return ScenarioSchema.parse(input);
}

/**
 * A reproducible link only carries non-sensitive scenario coordinates:
 * `?scenario=active-month&actor=user_0002&seed=42`. Manual edits are never in
 * a URL — use snapshots for those.
 */
export interface ScenarioLinkParams {
  scenario?: string;
  actor?: string;
  seed?: number;
  theme?: string;
  mode?: 'light' | 'dark' | 'system';
  devtools?: boolean;
  /**
   * Presentation shell (`?shell=phone`); applied as a visible, clearable
   * override. `?frame=none` is an alias for `?shell=none` (open full screen,
   * without the frame); an explicit valid `shell` wins.
   */
  shell?: Shell;
  /**
   * Isolated, disposable world: the runtime suffixes the storage namespace
   * (`<namespace>~<sandbox>`) so two views of the same prototype on one
   * origin (e.g. a side-by-side scenario comparison) never share data.
   */
  sandbox?: string;
}

export const SANDBOX_PATTERN = /^[a-z0-9][a-z0-9-]{0,23}$/;

export function parseScenarioLink(search: string): ScenarioLinkParams {
  const params = new URLSearchParams(search);
  const out: ScenarioLinkParams = {};
  const scenario = params.get('scenario');
  if (scenario && /^[a-z][a-z0-9-]*$/.test(scenario)) out.scenario = scenario;
  const actor = params.get('actor');
  if (actor && /^[A-Za-z0-9_-]{1,64}$/.test(actor)) out.actor = actor;
  const seed = params.get('seed');
  if (seed && /^\d{1,10}$/.test(seed)) out.seed = Number(seed);
  const theme = params.get('theme');
  if (theme && /^[a-z][a-z0-9-]*$/.test(theme)) out.theme = theme;
  const mode = params.get('mode');
  if (mode === 'light' || mode === 'dark' || mode === 'system') out.mode = mode;
  const shell = ShellSchema.safeParse(params.get('shell'));
  if (shell.success) out.shell = shell.data;
  else if (params.get('frame') === 'none') out.shell = 'none';
  const sandbox = params.get('sandbox');
  if (sandbox && SANDBOX_PATTERN.test(sandbox)) out.sandbox = sandbox;
  const devtools = params.get('devtools');
  if (devtools === '0' || devtools === '1') out.devtools = devtools === '1';
  return out;
}

export function buildScenarioLink(base: string, params: ScenarioLinkParams): string {
  const url = new URL(base, 'http://protoyard.local');
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    url.searchParams.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }
  return base.startsWith('http') ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}
