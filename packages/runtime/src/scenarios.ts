import {
  type ActiveScenarioInfo,
  type ClockState,
  type DomainEvent,
  durationToMs,
  type EventApplyContext,
  type Row,
  type Scenario,
  type ScenarioController,
  type TimelineContext,
  type WorldSeed,
} from '@protoyard/core';
import {
  createGenerateContext,
  GENERATOR_SDK_VERSION,
  type IntegrityViolation,
  validateWorld,
  WorldIntegrityError,
} from '@protoyard/scenarios';
import type { Kernel } from './kernel.ts';

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

export interface ScenarioControllerExtras {
  /** A link asked for a different world than the one stored; never auto-applied. */
  pendingLink(): PendingLink | null;
}

type SafetySnapshot = (name: string) => Promise<unknown>;

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
  const byId = (id: string) => k.scenarios.find((s) => s.id === id);

  async function loadScenario(scenario: Scenario, seed: number): Promise<void> {
    const effective = withSeed(scenario, seed);
    const world = await k.definition.generate(createGenerateContext(effective));
    const violations = checkWorld(k, world, effective);
    const mode = k.options.validation ?? 'throw';
    if (violations.length && mode !== 'off') {
      const error = new WorldIntegrityError(scenario.id, violations);
      if (mode === 'throw') throw error;
      console.warn(error.message);
    }

    const db = k.db;
    // One transaction: either the whole new world lands or the old one stays.
    await db.transaction('rw', [...db.allTables], async () => {
      for (const name of db.allTables) await db.table(name).clear();
      await db.table('py_organizations').bulkAdd(world.organizations);
      await db.table('py_personas').bulkAdd(world.personas);
      await db.table('py_memberships').bulkAdd(world.memberships);
      if (world.events?.length) {
        await db
          .table('py_events')
          .bulkAdd(world.events.map((event) => ({ ...event, source: event.source ?? 'seed' })));
      }
      for (const [name, rows] of Object.entries(world.tables)) {
        if (rows.length && db.domainTables.includes(name)) await db.table(name).bulkAdd(rows);
      }
    });

    const info: ActiveScenarioInfo = {
      scenario,
      seed,
      generatorVersion: GENERATOR_SDK_VERSION,
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

  async function load(id: string, options: { seed?: number; snapshotFirst?: boolean } = {}) {
    const scenario = byId(id);
    if (!scenario) throw new UnknownScenarioError(id);
    if (options.snapshotFirst && k.active) {
      await saveSafetySnapshot(`Before loading ${scenario.name}`);
    }
    await loadScenario(scenario, options.seed ?? scenario.seed);
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
              generatorVersion: GENERATOR_SDK_VERSION,
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
        await loadScenario(scenario, active.seed);
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
          const base = createGenerateContext(withSeed(active.scenario, active.seed));
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
  };
}
