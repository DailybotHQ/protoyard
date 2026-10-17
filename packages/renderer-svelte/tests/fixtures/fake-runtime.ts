import {
  type ActiveScenarioInfo,
  type AppearanceState,
  createPermissionPolicy,
  createSimulationClock,
  createSimulationEnvironment,
  type LoadProgress,
  type Membership,
  type Organization,
  type Overrides,
  type Persona,
  type Principal,
  type PrototypeDefinition,
  type PrototypeRuntime,
  parseManifest,
  parseScenario,
  resolveEffective,
  resolvePrincipal,
  type Scenario,
  type SnapshotSummary,
} from '@protoyard/core';

/**
 * In-memory stand-in for `@protoyard/runtime`, implementing the core
 * `PrototypeRuntime` contract closely enough to test the renderer and
 * DevTools without IndexedDB. Not a product feature.
 */

const persona = (id: string, name: string): Persona => ({
  id,
  name,
  locale: 'en-US',
  timezone: 'UTC',
  joinedAt: '2026-01-01T00:00:00.000Z',
  onboardingComplete: true,
  preferences: {},
});

export function createFakeRuntime(
  options: { db?: unknown; persistent?: boolean } = {}
): PrototypeRuntime {
  const manifest = parseManifest({
    id: 'test.fake',
    slug: 'fake',
    name: 'Fake Prototype',
    version: '0.1.0',
    storage: { namespace: 'fake', schemaVersion: 1 },
    scenarios: ['empty', 'busy'],
  });
  const scenarios: Scenario[] = [
    parseScenario({ id: 'empty', name: 'Empty', seed: 1, referenceTime: '2026-10-16T10:00:00Z' }),
    parseScenario({
      id: 'busy',
      name: 'Busy',
      group: 'Lifecycle',
      seed: 2,
      referenceTime: '2026-10-16T10:00:00Z',
    }),
  ];
  const org: Organization = {
    id: 'org_0001',
    name: 'Acme',
    type: 'company',
    plan: 'free',
    billingStatus: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    size: 2,
    featureFlags: {},
  };
  const personas = [persona('user_0001', 'Olivia Owner'), persona('user_0002', 'Victor Viewer')];
  const memberships: Membership[] = [
    {
      id: 'm1',
      personaId: 'user_0001',
      organizationId: org.id,
      role: 'owner',
      joinedAt: org.createdAt,
      capabilities: [],
    },
    {
      id: 'm2',
      personaId: 'user_0002',
      organizationId: org.id,
      role: 'viewer',
      joinedAt: org.createdAt,
      capabilities: [],
    },
  ];
  const policy = createPermissionPolicy();
  const clock = createSimulationClock({ referenceTime: '2026-10-16T10:00:00Z' });
  const environment = createSimulationEnvironment({ sleep: async () => {} });
  const preferences = new Map<string, Persona['preferences']>();

  let overrides: Overrides = {};
  let actorId = 'user_0001';
  let active: ActiveScenarioInfo | null = null;
  const listeners = {
    scenario: new Set<(info: ActiveScenarioInfo | null) => void>(),
    progress: new Set<(p: LoadProgress | null) => void>(),
    session: new Set<(p: Principal | null) => void>(),
    overrides: new Set<(o: Overrides) => void>(),
    theme: new Set<(s: AppearanceState) => void>(),
  };
  const tables: Record<string, Record<string, unknown>[]> = { notes: [] };
  let saved: SnapshotSummary[] = [];

  const principal = (): Principal | null => {
    const id = overrides.actorId ?? actorId;
    const p = personas.find((x) => x.id === id);
    if (!p) return null;
    const m = memberships.find((x) => x.personaId === id) ?? null;
    return resolvePrincipal(p, org, m, policy, overrides.role ?? null);
  };
  const appearance = (): AppearanceState => {
    const pref = preferences.get(principal()?.persona.id ?? '') ?? {};
    const mode = resolveEffective(
      {
        override: overrides.mode,
        preference: pref.mode,
        scenario: active?.scenario.appearance.mode,
      },
      manifest.defaultMode
    );
    return {
      theme: resolveEffective(
        {
          override: overrides.themeId,
          preference: pref.themeId,
          scenario: active?.scenario.appearance.themeId,
        },
        manifest.defaultTheme
      ),
      mode,
      resolvedMode: mode.value === 'dark' ? 'dark' : 'light',
      reducedMotion: resolveEffective(
        { override: overrides.reducedMotion, preference: pref.reducedMotion },
        false
      ),
      viewport: resolveEffective({ override: overrides.viewport }, manifest.preview.viewport),
      density: resolveEffective({ override: overrides.density }, 1),
    };
  };
  const emit = () => {
    for (const l of listeners.session) l(principal());
    for (const l of listeners.overrides) l(overrides);
    for (const l of listeners.theme) l(appearance());
  };
  const sub = <T>(set: Set<T>, l: T) => {
    set.add(l);
    return () => {
      set.delete(l);
    };
  };

  let progress: LoadProgress | null = null;
  const report = (p: LoadProgress | null, onProgress?: (p: LoadProgress) => void) => {
    progress = p;
    if (p) onProgress?.(p);
    for (const l of listeners.progress) l(p);
  };
  const load = async (
    id: string,
    opts: { seed?: number; onProgress?: (p: LoadProgress) => void } = {}
  ) => {
    const scenario = scenarios.find((s) => s.id === id);
    if (!scenario) throw new Error(`Unknown scenario ${id}`);
    const rows = id === 'busy' ? 1 : 0;
    report({ scenarioId: id, phase: 'generate', done: 0, total: 1 }, opts.onProgress);
    report({ scenarioId: id, phase: 'validate', done: 0, total: 1 }, opts.onProgress);
    report({ scenarioId: id, phase: 'write', done: 0, total: rows }, opts.onProgress);
    report({ scenarioId: id, phase: 'done', done: rows, total: rows }, opts.onProgress);
    active = {
      scenario,
      loadedAt: '2026-10-16T10:00:00.000Z',
      seed: opts.seed ?? scenario.seed,
      generatorVersion: 1,
    };
    overrides = {};
    actorId = scenario.actor.id;
    tables.notes = id === 'busy' ? [{ id: 'note_0001', title: 'Hello' }] : [];
    clock.resetClock();
    for (const l of listeners.scenario) l(active);
    emit();
    report(null);
  };

  const definition = {
    manifest,
    database: { versions: [{ version: 1, stores: { notes: 'id' } }] },
    scenarios,
    generate: () => ({ organizations: [], personas: [], memberships: [], tables: {} }),
  } satisfies PrototypeDefinition;

  return {
    prototypeId: manifest.id,
    manifest,
    definition,
    db: options.db ?? null,
    policy,
    clock,
    environment,
    scenarios: {
      list: () => scenarios,
      get: (id) => scenarios.find((s) => s.id === id),
      active: () => active,
      ensureSeeded: async () => {
        if (!active) await load('empty');
      },
      load,
      reset: async (o = {}) => {
        if (active) await load(active.scenario.id, { seed: active.seed, ...o });
      },
      advance: async (duration) => {
        clock.commitAdvance(duration);
        return { applied: duration.days ?? 0, skipped: 0 };
      },
      subscribe: (l) => sub(listeners.scenario, l),
      progress: () => progress,
      subscribeProgress: (l) => sub(listeners.progress, l),
    },
    session: {
      principal,
      personas: () => personas,
      organizations: () => [org],
      memberships: () => memberships,
      switchActor: async (id) => {
        actorId = id;
        overrides = { ...overrides, actorId: undefined };
        emit();
      },
      switchOrganization: async () => {},
      can: (cap, res) => policy.can(principal(), cap, res),
      assert: (cap, res) => policy.assert(principal(), cap, res),
      refresh: async () => {},
      subscribe: (l) => sub(listeners.session, l),
    },
    overrides: {
      get: () => overrides,
      set: async (patch) => {
        overrides = { ...overrides, ...patch };
        if (patch.environment) environment.set(patch.environment);
        emit();
      },
      clear: async (keys) => {
        if (!keys) overrides = {};
        else {
          const next = { ...overrides };
          for (const k of keys) delete next[k];
          overrides = next;
        }
        emit();
      },
      subscribe: (l) => sub(listeners.overrides, l),
    },
    theme: {
      themes: () => [],
      get: () => undefined,
      appearance,
      setPreference: async (patch) => {
        const id = principal()?.persona.id ?? '';
        preferences.set(id, { ...preferences.get(id), ...patch });
        emit();
      },
      setOverride: async (patch) => {
        const { themeId, mode, reducedMotion, viewport, density } = patch;
        overrides = {
          ...overrides,
          ...(themeId !== undefined ? { themeId } : {}),
          ...(mode !== undefined ? { mode } : {}),
          ...(reducedMotion !== undefined ? { reducedMotion } : {}),
          ...(viewport !== undefined ? { viewport } : {}),
          ...(density !== undefined ? { density } : {}),
        };
        emit();
      },
      clearOverride: async () => {
        const {
          themeId: _t,
          mode: _m,
          reducedMotion: _r,
          viewport: _v,
          density: _d,
          ...rest
        } = overrides;
        overrides = rest;
        emit();
      },
      subscribe: (l) => sub(listeners.theme, l),
    },
    snapshots: {
      list: async () => [...saved],
      save: async ({ name, notes = '' }) => {
        const summary: SnapshotSummary = {
          format: 'protoyard.snapshot',
          formatVersion: 1,
          id: `snap_${saved.length + 1}`,
          name,
          notes,
          prototypeId: manifest.id,
          prototypeVersion: manifest.version,
          schemaVersion: 1,
          scenarioId: active?.scenario.id ?? null,
          scenarioVersion: active?.scenario.version ?? null,
          seed: active?.seed ?? null,
          referenceTime: active?.scenario.referenceTime ?? null,
          createdAt: '2026-10-16T10:00:00.000Z',
          actorId,
          organizationId: org.id,
          clock: null,
          environment: {},
          overrides: {},
          appearance: {},
          stats: { notes: tables.notes?.length ?? 0 },
        };
        saved.push(summary);
        return summary;
      },
      restore: async () => {
        for (const l of listeners.scenario) l(active);
      },
      remove: async (id) => {
        saved = saved.filter((s) => s.id !== id);
      },
      exportJson: async () => ({ filename: 'fake.protoyard.json', json: '{}' }),
      previewImport: async () => {
        throw new Error('not implemented in fake');
      },
      importJson: async () => {
        throw new Error('not implemented in fake');
      },
      build: async () => {
        throw new Error('not implemented in fake');
      },
    },
    data: {
      tables: () => Object.keys(tables),
      counts: async () => Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
      rows: async (table, o = {}) =>
        (tables[table] ?? []).slice(o.offset ?? 0, (o.offset ?? 0) + (o.limit ?? 50)),
    },
    storage: () =>
      options.persistent === false
        ? { backend: 'memory', persistent: false, warning: 'IndexedDB is unavailable (test).' }
        : { backend: 'indexeddb', persistent: true },
    environmentState: () => ({ ...environment.get(), ...overrides.environment }),
    destroy: async () => {},
    close: () => {},
  };
}
