import {
  type ActiveScenarioInfo,
  type AppearanceState,
  createPermissionPolicy,
  createSimulationClock,
  createSimulationEnvironment,
  DEFAULT_ENVIRONMENT,
  DEFAULT_POLICY,
  type EnvironmentState,
  type Membership,
  type Organization,
  type Overrides,
  type PermissionPolicy,
  type Persona,
  type Principal,
  type PrototypeDefinition,
  resolveEffective,
  resolvePrincipal,
  type Scenario,
  type SimulationClock,
  type SimulationEnvironment,
  type StorageStatus,
  type Theme,
} from '@protoyard/core';
import {
  type ControlStatePatch,
  type ControlStore,
  type PersonaPreference,
  type PrototypeDatabase,
  type PrototypeStorage,
  type StorageBackend,
} from '@protoyard/database';
import { PRESETS, resolveScenarios } from '@protoyard/scenarios';
import { createEmitter, createSerialQueue, type Emitter } from './emitter.ts';
import type { MatchMedia, RuntimeOptions } from './options.ts';
import { normalizeOverrides } from './overrides.ts';

/**
 * Shared state behind every controller. Controllers mutate the persisted
 * state, update these caches synchronously and call `refreshDerived()`, so
 * synchronous getters (`principal()`, `appearance()`, `environment.get()`)
 * are always consistent with the last committed change.
 */
export interface Kernel {
  readonly definition: PrototypeDefinition;
  readonly db: PrototypeDatabase;
  readonly control: ControlStore;
  readonly status: StorageStatus;
  readonly backend: StorageBackend;
  readonly options: RuntimeOptions;
  readonly scenarios: readonly Scenario[];
  readonly themes: readonly Theme[];
  readonly policy: PermissionPolicy;
  readonly clock: SimulationClock;
  /** The raw environment; `runtime.environment` wraps it to persist changes. */
  readonly env: SimulationEnvironment;
  readonly now: () => number;
  readonly serial: <T>(job: () => Promise<T>) => Promise<T>;
  readonly report: (error: unknown) => void;

  active: ActiveScenarioInfo | null;
  overrides: Overrides;
  actorId: string | null;
  organizationId: string | null;
  personas: Persona[];
  organizations: Organization[];
  memberships: Membership[];
  preferences: Map<string, PersonaPreference>;
  principal: Principal | null;
  appearance: AppearanceState;

  readonly events: {
    scenario: Emitter<ActiveScenarioInfo | null>;
    session: Emitter<Principal | null>;
    overrides: Emitter<Overrides>;
    appearance: Emitter<AppearanceState>;
  };

  /** Re-reads personas, organizations and memberships from the data DB. */
  reloadIdentity(): Promise<void>;
  /** Recomputes principal, environment and appearance; emits what changed. */
  refreshDerived(): void;
  /** Writes control state without echoing the clock subscription. */
  writeControl(patch: ControlStatePatch): Promise<void>;
  /** Replaces the clock state without triggering a redundant persist. */
  setClockSilently(state: Parameters<SimulationClock['setState']>[0]): void;
  dispose(): void;
}

const principalKey = (p: Principal | null) =>
  p
    ? JSON.stringify([
        p.persona,
        p.organization?.id,
        p.membership?.id,
        p.role,
        [...p.capabilities].sort(),
      ])
    : 'null';

function defaultMatchMedia(): MatchMedia | undefined {
  const mm = (globalThis as { matchMedia?: MatchMedia }).matchMedia;
  return typeof mm === 'function' ? (query) => mm.call(globalThis, query) : undefined;
}

export async function createKernel(
  definition: PrototypeDefinition,
  storage: PrototypeStorage,
  options: RuntimeOptions
): Promise<Kernel> {
  const report =
    options.onError ??
    ((error: unknown) => {
      console.error('[protoyard/runtime]', error);
    });
  const now = options.now ?? (() => Date.now());
  const { db, control } = storage;

  const themes: Theme[] = [...(options.themes ?? [])];
  for (const theme of definition.themes ?? []) {
    if (!themes.some((t) => t.id === theme.id)) themes.push(theme);
  }

  const stored = await control.readState();
  let storedOverrides: Overrides = {};
  try {
    storedOverrides = normalizeOverrides(stored.overrides ?? {});
  } catch (error) {
    report(error);
  }
  const fallbackClock = {
    referenceTime: stored.activeScenario?.scenario.referenceTime ?? new Date(now()).toISOString(),
  };
  let clock: SimulationClock;
  try {
    clock = createSimulationClock(stored.clock ?? fallbackClock);
    clock.now().toISOString();
  } catch (error) {
    // A corrupt stored clock must not brick the prototype: fall back and say so.
    report(error);
    clock = createSimulationClock(fallbackClock);
  }

  const matchMedia = options.matchMedia ?? defaultMatchMedia();
  const darkQuery = matchMedia?.('(prefers-color-scheme: dark)');
  const motionQuery = matchMedia?.('(prefers-reduced-motion: reduce)');

  let lastPrincipalKey = '';
  let lastAppearanceKey = '';
  let lastEnvKey = '';
  let silentClock = false;

  const kernel: Kernel = {
    definition,
    db,
    control,
    status: storage.status,
    backend: storage.backend,
    options,
    scenarios: resolveScenarios(definition.scenarios, PRESETS),
    themes,
    policy: createPermissionPolicy(definition.policy ?? DEFAULT_POLICY),
    clock,
    env: createSimulationEnvironment(options.sleep ? { sleep: options.sleep } : {}),
    now,
    serial: createSerialQueue(),
    report,

    active: stored.activeScenario ?? null,
    overrides: storedOverrides,
    actorId: stored.actorId ?? null,
    organizationId: stored.organizationId ?? null,
    personas: [],
    organizations: [],
    memberships: [],
    preferences: new Map((await control.listPreferences()).map((p) => [p.personaId, p])),
    principal: null,
    appearance: undefined as unknown as AppearanceState,

    events: {
      scenario: createEmitter(report),
      session: createEmitter(report),
      overrides: createEmitter(report),
      appearance: createEmitter(report),
    },

    async reloadIdentity() {
      const [personas, organizations, memberships] = await db.transaction(
        'r',
        ['py_personas', 'py_organizations', 'py_memberships'],
        () =>
          Promise.all([
            db.table('py_personas').toArray(),
            db.table('py_organizations').toArray(),
            db.table('py_memberships').toArray(),
          ])
      );
      kernel.personas = personas as Persona[];
      kernel.organizations = organizations as Organization[];
      kernel.memberships = memberships as Membership[];
    },

    refreshDerived() {
      kernel.principal = computePrincipal(kernel);
      const key = principalKey(kernel.principal);
      const sessionChanged = key !== lastPrincipalKey;
      lastPrincipalKey = key;

      const env = computeEnvironment(kernel);
      const envKey = JSON.stringify(env);
      if (envKey !== lastEnvKey) {
        lastEnvKey = envKey;
        kernel.env.set(env);
      }

      kernel.appearance = computeAppearance(kernel, {
        prefersDark: darkQuery?.matches ?? false,
        prefersReducedMotion: motionQuery?.matches ?? false,
      });
      const appearanceKey = JSON.stringify(kernel.appearance);
      const appearanceChanged = appearanceKey !== lastAppearanceKey;
      lastAppearanceKey = appearanceKey;

      if (sessionChanged) kernel.events.session.emit(kernel.principal);
      if (appearanceChanged) kernel.events.appearance.emit(kernel.appearance);
    },

    writeControl: (patch) => control.writeState(patch),

    setClockSilently(state) {
      silentClock = true;
      try {
        clock.setState(state);
      } finally {
        silentClock = false;
      }
    },

    dispose() {
      unsubscribeClock();
      darkQuery?.removeEventListener('change', onMediaChange);
      motionQuery?.removeEventListener('change', onMediaChange);
      for (const emitter of Object.values(kernel.events)) emitter.clear();
    },
  };

  // Clock changes (preview, running) persist so a reload shows the same time.
  const unsubscribeClock = clock.subscribe((state) => {
    if (silentClock) return;
    control.setState('clock', state).catch(report);
  });
  const onMediaChange = () => kernel.refreshDerived();
  darkQuery?.addEventListener('change', onMediaChange);
  motionQuery?.addEventListener('change', onMediaChange);

  await kernel.reloadIdentity();
  kernel.refreshDerived();
  return kernel;
}

function computePrincipal(k: Kernel): Principal | null {
  if (k.personas.length === 0) return null;
  const scenarioActor = k.active?.scenario.actor.id;
  const wanted = k.overrides.actorId ?? k.actorId ?? scenarioActor;
  const persona =
    k.personas.find((p) => p.id === wanted) ??
    k.personas.find((p) => p.id === scenarioActor) ??
    (k.personas[0] as Persona);

  const own = k.memberships.filter((m) => m.personaId === persona.id);
  const wantedOrg =
    k.overrides.organizationId ?? k.organizationId ?? k.active?.scenario.organization.id;
  let membership = own.find((m) => m.organizationId === wantedOrg) ?? null;
  let organization: Organization | null = null;
  if (membership) {
    organization = k.organizations.find((o) => o.id === membership?.organizationId) ?? null;
  } else if (k.overrides.organizationId) {
    // An explicit override may show an org the persona does not belong to.
    organization = k.organizations.find((o) => o.id === k.overrides.organizationId) ?? null;
  } else {
    membership = own[0] ?? null;
    organization = membership
      ? (k.organizations.find((o) => o.id === membership?.organizationId) ?? null)
      : null;
  }
  return resolvePrincipal(persona, organization, membership, k.policy, k.overrides.role ?? null);
}

function computeEnvironment(k: Kernel): EnvironmentState {
  const scenario = k.active?.scenario;
  const scenarioEnv = scenario?.environment ?? {};
  const overrideEnv = k.overrides.environment ?? {};
  const organization = k.principal?.organization ?? null;
  const subscription =
    overrideEnv.subscription ?? scenarioEnv.subscription ?? scenario?.organization.subscription;
  const state: EnvironmentState = {
    ...DEFAULT_ENVIRONMENT,
    ...scenarioEnv,
    ...overrideEnv,
    featureFlags: {
      ...scenario?.organization.featureFlags,
      ...organization?.featureFlags,
      ...scenarioEnv.featureFlags,
      ...overrideEnv.featureFlags,
    },
  };
  if (subscription) state.subscription = subscription;
  else delete state.subscription;
  return state;
}

function computeAppearance(
  k: Kernel,
  media: { prefersDark: boolean; prefersReducedMotion: boolean }
): AppearanceState {
  const manifest = k.definition.manifest;
  const scenario = k.active?.scenario.appearance ?? {};
  const persona = k.principal?.persona;
  const stored = persona ? k.preferences.get(persona.id) : undefined;
  const preference = { ...persona?.preferences, ...stored };
  const o = k.overrides;

  let theme = resolveEffective(
    { override: o.themeId, preference: preference.themeId, scenario: scenario.themeId },
    manifest.defaultTheme
  );
  // Unknown theme ids (a deleted custom theme, a bad link) fall back visibly.
  if (k.themes.length > 0 && !k.themes.some((t) => t.id === theme.value)) {
    const fallback = k.themes.some((t) => t.id === manifest.defaultTheme)
      ? manifest.defaultTheme
      : (k.themes[0] as Theme).id;
    theme = { value: fallback, source: 'default' };
  }
  const mode = resolveEffective(
    { override: o.mode, preference: preference.mode, scenario: scenario.mode },
    manifest.defaultMode
  );
  return {
    theme,
    mode,
    resolvedMode: mode.value === 'system' ? (media.prefersDark ? 'dark' : 'light') : mode.value,
    reducedMotion: resolveEffective(
      {
        override: o.reducedMotion,
        preference: preference.reducedMotion,
        scenario: scenario.reducedMotion,
      },
      media.prefersReducedMotion
    ),
    density: resolveEffective(
      { override: o.density },
      k.themes.find((t) => t.id === theme.value)?.density ?? 1
    ),
    viewport: resolveEffective(
      { override: o.viewport, scenario: scenario.viewport },
      manifest.preview.viewport
    ),
  };
}
