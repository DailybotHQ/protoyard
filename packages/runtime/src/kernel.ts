import {
  type ActiveScenarioInfo,
  type AppearanceState,
  createPendingTracker,
  createPermissionPolicy,
  createSimulationClock,
  createSimulationEnvironment,
  DEFAULT_ENVIRONMENT,
  DEFAULT_POLICY,
  type DeviceSpec,
  defaultDeviceFor,
  deviceFitsShell,
  type EnvironmentState,
  getDevice,
  layoutChoices,
  type Membership,
  type Organization,
  type Overrides,
  type PendingTracker,
  type PermissionPolicy,
  type Persona,
  type Principal,
  PrototypeAuthOptionsSchema,
  type PrototypeDefinition,
  type PrototypeManifest,
  resolveEffective,
  resolvePrincipal,
  resolveShell,
  type Scenario,
  type SimulationClock,
  type SimulationEnvironment,
  STYLE_OVERRIDE_KEYS,
  type StorageStatus,
  type StyleOverrideKey,
  type Theme,
  ThemeSchema,
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
import { loadCustomThemes } from './theme.ts';

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
  /** Ids in `themes` that are Theme Studio custom themes (control DB). */
  readonly customThemeIds: Set<string>;
  /** Ids in `themes` registered by `options.resolveTheme` (library origin). */
  readonly libraryThemeIds: Set<string>;
  readonly policy: PermissionPolicy;
  readonly clock: SimulationClock;
  /**
   * The raw environment; `runtime.environment` wraps it to persist changes.
   * Its `run` counts as pending in `pending` while it waits and works.
   */
  readonly env: SimulationEnvironment;
  /** Operations in flight (`runtime.pending`). */
  readonly pending: PendingTracker;
  readonly now: () => number;
  readonly serial: <T>(job: () => Promise<T>) => Promise<T>;
  readonly report: (error: unknown) => void;

  active: ActiveScenarioInfo | null;
  overrides: Overrides;
  actorId: string | null;
  organizationId: string | null;
  /** Simulated sign-out: no principal unless a DevTools actor override is set. */
  signedOut: boolean;
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
  /**
   * Returns a known theme or loads `id` through `options.resolveTheme`
   * (pending while it loads), validates it and registers it. Never rejects:
   * failures are reported and resolve `undefined`.
   */
  ensureTheme(id: string): Promise<Theme | undefined>;
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
  const customThemeIds = loadCustomThemes(stored.customThemes, themes, report);
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

  const pending = createPendingTracker({ onError: report });
  const rawEnv = createSimulationEnvironment(options.sleep ? { sleep: options.sleep } : {});
  // Every simulated service call (members, identity, prototype services, the
  // mock HTTP layer) shows as pending, including its simulated latency.
  const env: SimulationEnvironment = {
    ...rawEnv,
    run: (operation, fn) =>
      pending.track({ kind: 'service', label: operation }, () => rawEnv.run(operation, fn)),
  };

  const libraryThemeIds = new Set<string>();
  const loadingThemes = new Map<string, Promise<Theme | undefined>>();
  // Ids that failed: background healing skips them; an explicit ensure retries.
  const failedThemes = new Set<string>();

  /** Loads, validates and registers one theme; failures are reported, never thrown. */
  const resolveTheme = async (id: string): Promise<Theme | undefined> => {
    try {
      const result = await (options.resolveTheme as NonNullable<RuntimeOptions['resolveTheme']>)(
        id
      );
      if (result) {
        const theme = ThemeSchema.parse(result);
        if (theme.id !== id) throw new Error(`Theme resolver: got "${theme.id}" for "${id}".`);
        if (!themes.some((t) => t.id === id)) {
          themes.push(theme);
          libraryThemeIds.add(id);
        }
        return themes.find((t) => t.id === id);
      }
    } catch (error) {
      report(error);
    }
    failedThemes.add(id);
    return undefined;
  };
  // The latest background theme load (awaited once at boot).
  let healing: Promise<void> | undefined;

  const kernel: Kernel = {
    definition,
    db,
    control,
    status: storage.status,
    backend: storage.backend,
    options,
    scenarios: resolveScenarios(definition.scenarios, PRESETS),
    themes,
    customThemeIds,
    libraryThemeIds,
    policy: createPermissionPolicy(definition.policy ?? DEFAULT_POLICY),
    clock,
    env,
    pending,
    now,
    serial: createSerialQueue(),
    report,

    active: stored.activeScenario ?? null,
    overrides: storedOverrides,
    actorId: stored.actorId ?? null,
    organizationId: stored.organizationId ?? null,
    // A world stored before this flag existed stays signed in; a fresh one follows the definition.
    signedOut: stored.signedOut ?? (stored.activeScenario ? false : signedOutByDefault(definition)),
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

    async ensureTheme(id) {
      const known = themes.find((t) => t.id === id);
      if (known || !options.resolveTheme) return known;
      let job = loadingThemes.get(id);
      if (!job) {
        job = pending
          .track({ kind: 'other', label: `Loading theme “${id}”…` }, () => resolveTheme(id))
          .finally(() => loadingThemes.delete(id));
        loadingThemes.set(id, job);
      }
      return job;
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

      // A requested id nobody has loaded yet (stored state at boot, a persona
      // switch, a data-defined preference): load it and re-apply once it arrives.
      const wanted = requestedTheme(kernel).value;
      if (
        options.resolveTheme &&
        !failedThemes.has(wanted) &&
        !themes.some((t) => t.id === wanted)
      ) {
        healing = kernel
          .ensureTheme(wanted)
          .then((theme) => {
            if (theme) kernel.refreshDerived();
          })
          .catch(report);
      }
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
  // A stored library theme loads before anyone can observe the appearance,
  // so a reload never flashes the default.
  await healing;
  return kernel;
}

/** The definition's opt-in (`auth.signedOutByDefault`); `false` when omitted. */
export function signedOutByDefault(definition: PrototypeDefinition): boolean {
  return PrototypeAuthOptionsSchema.parse(definition.auth ?? {}).signedOutByDefault;
}

function computePrincipal(k: Kernel): Principal | null {
  if (k.personas.length === 0) return null;
  // Signed out: nobody acts, unless DevTools explicitly acts as someone.
  if (k.signedOut && k.overrides.actorId === undefined) return null;
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

/** The active persona's preferences: data-defined, then saved in the control DB. */
function preferenceOf(k: Kernel) {
  const persona = k.principal?.persona;
  const stored = persona ? k.preferences.get(persona.id) : undefined;
  return { ...persona?.preferences, ...stored };
}

/** The theme id asked for (override › preference › scenario › manifest), before any fallback. */
function requestedTheme(k: Kernel) {
  const preference = preferenceOf(k);
  return resolveEffective(
    {
      override: k.overrides.themeId,
      preference: preference.themeId,
      scenario: k.active?.scenario.appearance?.themeId,
    },
    k.definition.manifest.defaultTheme
  );
}

function computeAppearance(
  k: Kernel,
  media: { prefersDark: boolean; prefersReducedMotion: boolean }
): AppearanceState {
  const manifest = k.definition.manifest;
  const scenario = k.active?.scenario.appearance ?? {};
  const preference = preferenceOf(k);
  const o = k.overrides;

  let theme = requestedTheme(k);
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
    ...computeStyle(scenario, o),
    viewport: resolveEffective(
      { override: o.viewport, scenario: scenario.viewport },
      manifest.preview.viewport
    ),
    ...computeShell(manifest, scenario, o),
    layout: computeLayout(manifest, scenario, o),
  };
}

/** Style presets resolve override › scenario; `null` keeps the theme's own value. */
function computeStyle(
  scenario: Scenario['appearance'],
  o: Overrides
): Pick<AppearanceState, StyleOverrideKey> {
  return Object.fromEntries(
    STYLE_OVERRIDE_KEYS.map((key) => [
      key,
      resolveEffective({ override: o[key], scenario: scenario[key] }, null),
    ])
  );
}

/**
 * Layout resolves like the shell (override › scenario › manifest). A layout
 * the prototype does not offer falls back visibly to the manifest layout.
 */
function computeLayout(
  manifest: PrototypeManifest,
  scenario: Scenario['appearance'],
  o: Overrides
): AppearanceState['layout'] {
  const settings = manifest.preview.layout;
  const fallback = settings?.id ?? 'custom';
  const layout = resolveEffective({ override: o.layout, scenario: scenario.layout }, fallback);
  return layoutChoices(settings).includes(layout.value)
    ? layout
    : { value: fallback, source: 'default' };
}

/**
 * Shell, device and orientation resolve like viewport (override › scenario ›
 * manifest). Inputs that cannot apply (a phone in a desktop window, landscape
 * for a window) fall back visibly to the default rather than failing.
 */
function computeShell(
  manifest: PrototypeManifest,
  scenario: Scenario['appearance'],
  o: Overrides
): Pick<AppearanceState, 'shell' | 'device' | 'orientation'> {
  const preview = manifest.preview;
  const requested = resolveEffective(
    { override: o.shell, scenario: scenario.shell },
    preview.shell ?? 'auto'
  );
  const shell = {
    value: resolveShell(requested.value, manifest.platform),
    source: requested.source,
  };
  const fallbackDevice =
    preview.device && deviceFitsShell(preview.device, shell.value)
      ? preview.device
      : defaultDeviceFor(shell.value, preview.viewport);
  let device = resolveEffective({ override: o.device, scenario: scenario.device }, fallbackDevice);
  if (!deviceFitsShell(device.value, shell.value)) {
    device = { value: fallbackDevice, source: 'default' };
  }
  const spec = getDevice(device.value) as DeviceSpec;
  let orientation = resolveEffective(
    { override: o.orientation, scenario: scenario.orientation },
    preview.orientation ?? spec.orientation
  );
  if (!spec.rotatable && orientation.value !== spec.orientation) {
    orientation = { value: spec.orientation, source: 'default' };
  }
  return { shell, device, orientation };
}
