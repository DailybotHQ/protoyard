import {
  type ActiveScenarioInfo,
  type ClockState,
  type DomainEvent,
  durationToMs,
  type EventApplyContext,
  type LoadPhase,
  type LoadProgress,
  type LoadScenarioOptions,
  type Row,
  type Scenario,
  type ScenarioController,
  type TimelineContext,
  type WorldSeed,
} from '@protoyard/core';
import {
  createGenerateContextAsync,
  GENERATOR_SDK_VERSION,
  type IntegrityViolation,
  validateWorld,
  WorldIntegrityError,
} from '@protoyard/scenarios';
import { createEmitter } from './emitter.ts';
import type { Kernel } from './kernel.ts';
import { applyOverrides } from './overrides.ts';

export class UnknownScenarioError extends Error {
  readonly scenarioId: string;

  constructor(scenarioId: string) {
    super(`Unknown scenario "${scenarioId}". Check src/scenarios/index.ts and protoyard.json.`);
    this.name = 'UnknownScenarioError';
    this.scenarioId = scenarioId;
  }
}

export interface PendingLink {
  scenario: string;
  seed?: number;
  /** Why the link was not applied automatically. */
  reason: string;
}

/** Wall-clock cost of the last scenario load, for DevTools and benchmarks. */
export interface LoadTimings {
  scenarioId: string;
  generateMs: number;
  validateMs: number;
  writeMs: number;
  rows: number;
}

/** Core load options plus runtime-only tuning. */
export interface RuntimeLoadOptions extends LoadScenarioOptions {
  /** Rows per bulkAdd for this load only (benchmarks; default from RuntimeOptions). */
  writeChunkSize?: number;
}

export interface ScenarioControllerExtras {
  load(id: string, options?: RuntimeLoadOptions): Promise<void>;
  reset(
    options?: Pick<RuntimeLoadOptions, 'snapshotFirst' | 'onProgress' | 'writeChunkSize'>
  ): Promise<void>;
  /** A link asked for a different world than the one stored; never auto-applied. */
  pendingLink(): PendingLink | null;
  /** Timings of the most recent successful load or reset in this session. */
  lastLoadTimings(): LoadTimings | null;
}

/**
 * Rows per `bulkAdd` while writing a world. Chosen from measurements (see
 * tmp/lane-a/scale-results.md → docs/PERFORMANCE.md): large enough that
 * per-request overhead is negligible, small enough that progress updates and
 * paints happen several times per second on big worlds.
 */
export const DEFAULT_WRITE_CHUNK = 1000;

/** Lets the event loop run (paint a progress bar) between blocking phases. */
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

type SafetySnapshot = (name: string) => Promise<unknown>;

/** SDK + prototype generator versions recorded with every loaded world. */
export function generatorVersions(k: Kernel) {
  const own = k.definition.generatorVersion;
  return {
    generatorVersion: GENERATOR_SDK_VERSION,
    ...(own !== undefined ? { prototypeGeneratorVersion: own } : {}),
  };
}

function withSeed(scenario: Scenario, seed: number): Scenario {
  return seed === scenario.seed ? scenario : { ...scenario, seed };
}

/** Integrity of a generated world, including tables the schema does not declare. */
export function checkWorld(k: Kernel, world: WorldSeed, scenario: Scenario): IntegrityViolation[] {
  const violations: IntegrityViolation[] = [];
  for (const table of Object.keys(world.tables)) {
    if (!k.db.domainTables.includes(table)) {
      violations.push({
        table,
        rowId: '*',
        message: `table "${table}" is not declared in database/schema.ts`,
      });
    }
  }
  const rules = k.options.integrity ?? k.definition.integrity ?? {};
  return [
    ...violations,
    ...validateWorld(world, { ...rules, referenceTime: scenario.referenceTime }),
  ];
}

export function createScenarioController(
  k: Kernel,
  saveSafetySnapshot: SafetySnapshot
): ScenarioController & ScenarioControllerExtras {
  let pending: PendingLink | null = null;
  let lastTimings: LoadTimings | null = null;
  const byId = (id: string) => k.scenarios.find((s) => s.id === id);

  let progress: LoadProgress | null = null;
  const progressEvents = createEmitter<LoadProgress | null>(k.report);

  function report(next: LoadProgress | null, onProgress?: (p: LoadProgress) => void) {
    progress = next;
    if (next && onProgress) {
      try {
        onProgress(next);
      } catch (error) {
        k.report(error);
      }
    }
    progressEvents.emit(next);
  }

  async function loadScenario(
    scenario: Scenario,
    seed: number,
    options: RuntimeLoadOptions = {}
  ): Promise<void> {
    const step = (phase: LoadPhase, done: number, total: number) =>
      report({ scenarioId: scenario.id, phase, done, total }, options.onProgress);
    try {
      await buildWorld(scenario, seed, step, options.writeChunkSize);
    } finally {
      report(null);
    }
  }

  async function buildWorld(
    scenario: Scenario,
    seed: number,
    step: (phase: LoadPhase, done: number, total: number) => void,
    writeChunkSize?: number
  ): Promise<void> {
    const effective = withSeed(scenario, seed);
    const timings = { generateMs: 0, validateMs: 0, writeMs: 0, rows: 0 };
    step('generate', 0, 1);
    // Yield between phases so a progress UI can paint before each blocking step.
    await yieldToBrowser();
    let started = performance.now();
    const world = await k.definition.generate(await createGenerateContextAsync(effective));
    timings.generateMs = performance.now() - started;
    step('generate', 1, 1);

    step('validate', 0, 1);
    await yieldToBrowser();
    started = performance.now();
    const violations = checkWorld(k, world, effective);
    timings.validateMs = performance.now() - started;
    const mode = k.options.validation ?? 'throw';
    if (violations.length && mode !== 'off') {
      const error = new WorldIntegrityError(scenario.id, violations);
      if (mode === 'throw') throw error;
      console.warn(error.message);
    }
    step('validate', 1, 1);

    const db = k.db;
    const batches: [string, readonly unknown[]][] = [
      ['py_organizations', world.organizations],
      ['py_personas', world.personas],
      ['py_memberships', world.memberships],
      [
        'py_events',
        (world.events ?? []).map((event) => ({ ...event, source: event.source ?? 'seed' })),
      ],
      ...Object.entries(world.tables).filter(([name]) => db.domainTables.includes(name)),
    ];
    const total = batches.reduce((sum, [, rows]) => sum + rows.length, 0);
    const chunkSize = Math.max(
      1,
      writeChunkSize ?? k.options.writeChunkSize ?? DEFAULT_WRITE_CHUNK
    );
    timings.rows = total;
    step('write', 0, total);
    await yieldToBrowser();
    started = performance.now();
    // ONE transaction keeps loads atomic (a failure leaves the old world). IndexedDB
    // commits a transaction as soon as it has no pending request at the end of a
    // task, so we can't await timers in here — but chunked bulkAdd calls are separate
    // requests whose completions are separate tasks, which lets the browser paint
    // and lets us report progress between chunks.
    await db.transaction('rw', [...db.allTables], async () => {
      for (const name of db.allTables) await db.table(name).clear();
      let written = 0;
      for (const [name, rows] of batches) {
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          await db.table(name).bulkAdd(chunk);
          written += chunk.length;
          step('write', written, total);
        }
      }
    });
    timings.writeMs = performance.now() - started;
    lastTimings = { scenarioId: scenario.id, ...timings };
    step('done', total, total);

    const info: ActiveScenarioInfo = {
      scenario,
      seed,
      ...generatorVersions(k),
      loadedAt: new Date(k.now()).toISOString(),
    };
    const clock: ClockState = {
      referenceTime: scenario.referenceTime,
      committedOffsetMs: 0,
      previewOffsetMs: 0,
      running: false,
    };
    await k.writeControl({
      activeScenario: info,
      clock,
      overrides: null,
      actorId: scenario.actor.id,
      organizationId: scenario.organization.id,
      timelineCheckpoint: {
        committedOffsetMs: 0,
        at: new Date(Date.parse(scenario.referenceTime)).toISOString(),
      },
    });

    k.active = info;
    k.overrides = {};
    k.actorId = scenario.actor.id;
    k.organizationId = scenario.organization.id;
    k.setClockSilently(clock);
    await k.reloadIdentity();
    k.refreshDerived();
    k.events.overrides.emit(k.overrides);
    k.events.scenario.emit(info);
  }

  async function load(id: string, options: RuntimeLoadOptions = {}) {
    const scenario = byId(id);
    if (!scenario) throw new UnknownScenarioError(id);
    if (options.snapshotFirst && k.active) {
      await saveSafetySnapshot(`Before loading ${scenario.name}`);
    }
    await loadScenario(scenario, options.seed ?? scenario.seed, options);
    pending = null;
  }

  return {
    list: () => k.scenarios,
    get: byId,
    active: () => k.active,
    pendingLink: () => pending,

    ensureSeeded: () =>
      k.serial(async () => {
        const link = k.options.link ?? {};
        if (!k.active) {
          // Data without a recorded scenario (control DB cleared separately):
          // adopt it instead of wiping someone's edits.
          const existing = await k.db.table('py_personas').count();
          const fallback =
            (link.scenario ? byId(link.scenario) : undefined) ??
            (k.definition.manifest.defaultScenario
              ? byId(k.definition.manifest.defaultScenario)
              : undefined) ??
            k.scenarios[0];
          if (!fallback) {
            throw new Error(
              'This prototype declares no scenarios; add one in src/scenarios/index.ts.'
            );
          }
          if (existing > 0) {
            const info: ActiveScenarioInfo = {
              scenario: fallback,
              seed: fallback.seed,
              ...generatorVersions(k),
              loadedAt: new Date(k.now()).toISOString(),
            };
            await k.writeControl({ activeScenario: info });
            k.active = info;
            k.refreshDerived();
            k.events.scenario.emit(info);
          } else {
            const seed = link.scenario === fallback.id ? link.seed : undefined;
            await load(fallback.id, seed !== undefined ? { seed } : {});
          }
        } else if (link.scenario) {
          const differs =
            link.scenario !== k.active.scenario.id ||
            (link.seed !== undefined && link.seed !== k.active.seed);
          pending = differs
            ? {
                scenario: link.scenario,
                ...(link.seed !== undefined ? { seed: link.seed } : {}),
                reason: byId(link.scenario)
                  ? 'This browser already has edits for another scenario. Load the linked scenario to replace them.'
                  : `The link points to unknown scenario "${link.scenario}".`,
              }
            : null;
        }

        if (link.actor && link.actor !== k.principal?.persona.id) {
          if (k.personas.some((p) => p.id === link.actor)) {
            k.actorId = link.actor;
            await k.writeControl({ actorId: link.actor });
            k.refreshDerived();
          }
        }
        // Link appearance is a visible, clearable override — never a persona preference.
        const themeOk = link.theme && k.themes.some((t) => t.id === link.theme);
        if (
          (themeOk && link.theme !== k.overrides.themeId) ||
          (link.mode && link.mode !== k.overrides.mode)
        ) {
          await applyOverrides(k, {
            ...k.overrides,
            ...(themeOk ? { themeId: link.theme } : {}),
            ...(link.mode ? { mode: link.mode } : {}),
          });
        }
      }),

    load: (id, options) => k.serial(() => load(id, options)),

    reset: (options = {}) =>
      k.serial(async () => {
        const active = k.active;
        if (!active) throw new Error('No active scenario to reset. Load one first.');
        if (options.snapshotFirst) {
          await saveSafetySnapshot(`Before resetting ${active.scenario.name}`);
        }
        // The stored scenario is used even if the code no longer lists it.
        const scenario = byId(active.scenario.id) ?? active.scenario;
        await loadScenario(scenario, active.seed, options);
      }),

    advance: (duration) =>
      k.serial(async () => {
        const active = k.active;
        if (!active) throw new Error('No active scenario. Load one before advancing time.');
        const ms = durationToMs(duration);
        if (!(ms > 0)) throw new RangeError('advance(): duration must be positive');

        const fromMs = k.clock.committed().getTime();
        const from = new Date(fromMs);
        const to = new Date(fromMs + ms);
        let applied = 0;
        let skipped = 0;

        const timeline = k.definition.timeline;
        if (timeline) {
          const base = await createGenerateContextAsync(withSeed(active.scenario, active.seed));
          const ctx: TimelineContext = {
            ...base,
            from,
            to,
            read: (table) => k.db.rows(table).toArray(),
          };
          const events = await timeline(ctx);
          const unique = new Map<string, DomainEvent>();
          for (const event of events) if (!unique.has(event.id)) unique.set(event.id, event);
          const candidates = [...unique.values()];
          const db = k.db;
          await db.transaction('rw', [...db.allTables], async () => {
            const seen = await db.table('py_events').bulkGet(candidates.map((e) => e.id));
            const fresh = candidates.filter((_, i) => seen[i] === undefined);
            skipped = candidates.length - fresh.length;
            const apply = k.definition.applyEvent;
            const ctxApply: EventApplyContext = {
              put: async (table, row) => {
                await db.rows(table).put(row);
              },
              get: (table, id) => db.rows(table).get(id) as Promise<Row | undefined>,
              remove: (table, id) => db.rows(table).delete(id),
            };
            fresh.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
            for (const event of fresh) {
              if (apply) await apply(event, ctxApply);
              await db.table('py_events').add({ ...event, source: event.source ?? 'timeline' });
            }
            applied = fresh.length;
          });
        }

        // Clock listeners (the UI) are still notified; only the duplicate
        // persist is skipped because clock + checkpoint are written together.
        k.setClockSilently({
          ...k.clock.getState(),
          committedOffsetMs: k.clock.getState().committedOffsetMs + ms,
        });
        const state = k.clock.getState();
        await k.writeControl({
          clock: state,
          timelineCheckpoint: { committedOffsetMs: state.committedOffsetMs, at: to.toISOString() },
        });
        if (applied > 0) {
          await k.reloadIdentity();
          k.refreshDerived();
        }
        return { applied, skipped };
      }),

    subscribe: (listener) => k.events.scenario.subscribe(listener),
    progress: () => progress,
    subscribeProgress: (listener) => progressEvents.subscribe(listener),
    lastLoadTimings: () => lastTimings,
  };
}
