import { parseInput, ValidationError } from '@protoyard/core';
import type { IdentityOps, ProtoyardRuntime } from '@protoyard/runtime';
import type { z } from 'zod';
import type { SaasOnboarding } from './schema.ts';

/**
 * The persisted onboarding wizard engine, generalised from
 * `templates/onboarding` (steps.ts + the mutate/settle pattern in services.ts).
 *
 * A prototype declares its answer steps; the engine appends the final
 * `done` step. Every mutation follows the service contract:
 *   1. `session.assert(capability)` — enforced even if the UI is bypassed,
 *   2. zod validation of the step's answer (`ValidationError.issues` per field),
 *   3. `environment.run('<area>.<step>')` — latency / offline / failures,
 *   4. ONE `db.transaction` that writes the answer AND the new wizard
 *      position, so a reload always resumes exactly where the person left off.
 *
 * Rows live in the kit's `saas_onboarding` table (one per persona).
 */

export const DONE_STEP = 'done';
export const ONBOARDING_TABLE = 'saas_onboarding';
export const DEFAULT_ONBOARDING_CAPABILITY = 'onboarding:progress';

/** Re-exported from core so kit consumers keep one import (field path → first message). */
export { parseInput, ValidationError };

/**
 * Runs inside the step's transaction, after validation (e.g. write a workspace
 * row). The transaction is a `runtime.identity.write`, so `identity` writes
 * personas, organizations and memberships atomically with the wizard row: if
 * the effect throws, neither the effect's writes nor the answer are saved.
 */
export type StepEffect = (
  answer: unknown,
  ctx: {
    at: string;
    personaId: string;
    organizationId: string | null;
    /** Identity writes in the same transaction (the session refreshes after commit). */
    identity: IdentityOps;
  }
) => void | Promise<void>;

export interface OnboardingStepDefinition {
  id: string;
  label: string;
  description?: string;
  /** Optional steps can be skipped. */
  optional?: boolean;
  /** Validates the submitted answer; omit for steps without input (acknowledge only). */
  schema?: z.ZodType;
  /** Extra capability this step needs on top of the wizard's. */
  capability?: string;
  effect?: StepEffect;
}

export interface OnboardingConfig {
  steps: readonly OnboardingStepDefinition[];
  /** Capability for every wizard action (default `onboarding:progress`). */
  capability?: string;
  /** Prefix of environment operation names (default `onboarding`). */
  area?: string;
  /** Domain tables step effects write, so they join the wizard's transaction. */
  tables?: readonly string[];
}

type Position = Pick<SaasOnboarding, 'currentStep' | 'completedSteps' | 'skippedSteps'>;

/** Pure step logic: shared by the engine, generators and screens. No IO. */
export function createOnboardingFlow(steps: readonly OnboardingStepDefinition[]) {
  if (steps.length === 0) throw new Error('An onboarding flow needs at least one step.');
  const ids = steps.map((s) => s.id);
  if (new Set(ids).size !== ids.length) throw new Error('Onboarding step ids must be unique.');
  if (ids.includes(DONE_STEP)) throw new Error(`"${DONE_STEP}" is added by the engine.`);

  const all = [...ids, DONE_STEP];
  const byId = new Map(steps.map((s) => [s.id, s]));
  const indexOf = (step: string) => all.indexOf(step);
  const known = (step: string) => {
    if (indexOf(step) < 0)
      throw new ValidationError({ form: `Unknown onboarding step "${step}".` });
  };
  const label = (step: string) => (step === DONE_STEP ? 'Done' : (byId.get(step)?.label ?? step));
  const isOptional = (step: string) => byId.get(step)?.optional === true;

  return {
    /** Answer steps in order (without `done`). */
    steps,
    /** Every step id in order, ending with `done`. */
    ids: all,
    step: (id: string) => byId.get(id),
    label,
    known,
    isOptional,
    next: (step: string) => all[indexOf(step) + 1] ?? DONE_STEP,
    previous: (step: string) => all[Math.max(0, indexOf(step) - 1)] ?? (all[0] as string),

    /** A step is reachable once every step before it was completed or skipped. */
    canVisit(state: Position, step: string): boolean {
      if (step === state.currentStep) return true;
      const settled = new Set([...state.completedSteps, ...state.skippedSteps]);
      return all.slice(0, indexOf(step)).every((s) => settled.has(s));
    },

    /** Required steps still missing before onboarding can be finished. */
    missingRequired: (state: Pick<Position, 'completedSteps'>) =>
      ids.filter((s) => !isOptional(s) && !state.completedSteps.includes(s)),

    /** Share of the wizard settled (answer steps completed or skipped, plus finishing), 0..1. */
    progressOf(state: Pick<SaasOnboarding, 'completedSteps' | 'skippedSteps' | 'completedAt'>) {
      if (state.completedAt) return 1;
      const settled = new Set([...state.completedSteps, ...state.skippedSteps]);
      return ids.filter((s) => settled.has(s)).length / all.length;
    },

    /**
     * Maps a 0..1 progress (`scenario.actor.onboardingProgress`) to the steps
     * already finished: 0.5 of 4 answer steps → 2 done, resume at step 3.
     */
    stepsForProgress(progress: number): { completed: string[]; current: string } {
      const count = Math.max(0, Math.min(ids.length, Math.round(progress * ids.length)));
      return { completed: ids.slice(0, count), current: ids[count] ?? DONE_STEP };
    },

    /** The state of someone who has not touched onboarding yet. */
    freshState(
      personaId: string,
      at: string,
      organizationId: string | null = null
    ): SaasOnboarding {
      return {
        id: personaId,
        personaId,
        organizationId,
        currentStep: all[0] as string,
        completedSteps: [],
        skippedSteps: [],
        answers: {},
        startedAt: null,
        updatedAt: at,
        completedAt: null,
      };
    },
  };
}

export type OnboardingFlow = ReturnType<typeof createOnboardingFlow>;

/** The slice of Dexie the engine needs; the default storage adapter provides it. */
interface TableLike<T> {
  get(id: string): Promise<T | undefined>;
  put(row: T): Promise<unknown>;
}
interface DatabaseLike {
  table<T>(name: string): TableLike<T>;
  transaction<R>(mode: 'rw', tables: string[], scope: () => Promise<R>): Promise<R>;
}

export function createOnboarding(runtime: ProtoyardRuntime, config: OnboardingConfig) {
  const flow = createOnboardingFlow(config.steps);
  const { session, environment, clock, identity } = runtime;
  const db = runtime.db as unknown as DatabaseLike;
  const capability = config.capability ?? DEFAULT_ONBOARDING_CAPABILITY;
  const area = config.area ?? 'onboarding';
  const tables = [ONBOARDING_TABLE, ...(config.tables ?? [])];
  const now = () => clock.now().toISOString();

  const principal = () => {
    const p = session.principal();
    if (!p) throw new Error('No active persona. Sign in or load a scenario first.');
    return p;
  };
  // A Dexie promise chain (no extra async layer) so it stays inside a transaction's zone.
  const read = (personaId: string) =>
    db
      .table<SaasOnboarding>(ONBOARDING_TABLE)
      .get(personaId)
      .then(
        (row) =>
          row ?? flow.freshState(personaId, now(), session.principal()?.organization?.id ?? null)
      );

  /** Marks `step` completed or skipped and moves to the next one. */
  const settle = (
    state: SaasOnboarding,
    step: string,
    how: 'completed' | 'skipped',
    at: string
  ): SaasOnboarding => {
    const without = (list: string[]) => list.filter((s) => s !== step);
    return {
      ...state,
      completedSteps:
        how === 'completed'
          ? [...without(state.completedSteps), step]
          : without(state.completedSteps),
      skippedSteps:
        how === 'skipped' ? [...without(state.skippedSteps), step] : without(state.skippedSteps),
      currentStep: flow.next(step),
      startedAt: state.startedAt ?? at,
      updatedAt: at,
    };
  };

  /** Read-modify-write of the actor's row inside one transaction. */
  const mutate = (
    operation: string,
    change: (state: SaasOnboarding, at: string) => SaasOnboarding | Promise<SaasOnboarding>
  ) => {
    const personaId = principal().persona.id;
    return environment.run(`${area}.${operation}`, () =>
      db.transaction('rw', tables, async () => {
        const at = now();
        const next = await change(await read(personaId), at);
        await db.table<SaasOnboarding>(ONBOARDING_TABLE).put(next);
        return next;
      })
    );
  };

  /**
   * Same as `mutate` for steps that also change the persona: runs through
   * `runtime.identity.write` (identity tables in the same transaction, session
   * refreshed after the commit). `change` is synchronous and the chain only
   * awaits Dexie promises, which keeps Dexie's transaction zone alive.
   */
  const mutateIdentity = (
    operation: string,
    change: (state: SaasOnboarding, at: string) => SaasOnboarding,
    onboardingComplete: boolean
  ) => {
    const personaId = principal().persona.id;
    return environment.run(`${area}.${operation}`, () =>
      identity.write(
        (ops) =>
          read(personaId).then((state) => {
            const next = change(state, now());
            return ops
              .getPersona(personaId)
              .then((persona) =>
                persona && persona.onboardingComplete !== onboardingComplete
                  ? ops.putPersona({ ...persona, onboardingComplete })
                  : undefined
              )
              .then(() => db.table<SaasOnboarding>(ONBOARDING_TABLE).put(next))
              .then(() => next);
          }),
        { tables }
      )
    );
  };

  const reachable = (state: SaasOnboarding, step: string) => {
    if (!flow.canVisit(state, step)) {
      throw new ValidationError({ form: `Finish the earlier steps before ${flow.label(step)}.` });
    }
  };

  return {
    flow,

    /** Current state for a persona (default: the actor), or a fresh one. Read-only. */
    state: (personaId: string = principal().persona.id) => read(personaId),

    /**
     * Saves a step's answer and moves on. Steps without a schema just confirm
     * (e.g. a viewer acknowledging a workspace they may not change).
     */
    async submit(step: string, input?: unknown) {
      session.assert(capability);
      flow.known(step);
      const definition = flow.step(step);
      if (!definition)
        throw new ValidationError({ form: 'The final step is finished with complete().' });
      if (definition.capability) session.assert(definition.capability);
      const answer = definition.schema ? parseInput(definition.schema, input) : undefined;
      const save = (state: SaasOnboarding, at: string) => {
        const answers = answer === undefined ? state.answers : { ...state.answers, [step]: answer };
        return settle({ ...state, answers }, step, 'completed', at);
      };
      const effect = definition.effect;
      if (!effect) {
        return mutate(step, (state, at) => {
          reachable(state, step);
          return save(state, at);
        });
      }
      // Effects run in ONE identity transaction with the wizard row: the answer,
      // the new position and the effect's writes commit together or not at all.
      const personaId = principal().persona.id;
      return environment.run(`${area}.${step}`, () =>
        identity.write(
          async (ops) => {
            const at = now();
            const state = await read(personaId);
            reachable(state, step);
            await effect(answer, {
              at,
              personaId: state.personaId,
              organizationId: state.organizationId,
              identity: ops,
            });
            const next = save(state, at);
            await db.table<SaasOnboarding>(ONBOARDING_TABLE).put(next);
            return next;
          },
          { tables }
        )
      );
    },

    /** Skips an optional step. A step already answered keeps its answer and stays completed. */
    async skip(step: string) {
      session.assert(capability);
      flow.known(step);
      if (!flow.isOptional(step)) {
        throw new ValidationError({
          form: `${flow.label(step)} is required and can't be skipped.`,
        });
      }
      return mutate(step, (state, at) => {
        reachable(state, step);
        return settle(
          state,
          step,
          state.completedSteps.includes(step) ? 'completed' : 'skipped',
          at
        );
      });
    },

    /** Back / jump to a step already reached. Persisted, so a reload lands there too. */
    async goTo(step: string) {
      session.assert(capability);
      flow.known(step);
      return mutate('navigate', (state, at) => {
        reachable(state, step);
        return { ...state, currentStep: step, startedAt: state.startedAt ?? at, updatedAt: at };
      });
    },

    /** Finishes the wizard and marks the persona `onboardingComplete` in the same transaction. */
    async complete() {
      session.assert(capability);
      return mutateIdentity(
        'complete',
        (state, at) => {
          const missing = flow.missingRequired(state);
          if (missing.length > 0) {
            throw new ValidationError({
              form: `Finish ${missing.map(flow.label).join(' and ')} first.`,
            });
          }
          return { ...state, currentStep: DONE_STEP, completedAt: at, updatedAt: at };
        },
        true
      );
    },

    /** Starts over at step 1. Earlier answers stay as defaults; step effects are not undone. */
    async restart() {
      session.assert(capability);
      return mutateIdentity(
        'restart',
        (state, at) => ({
          ...state,
          currentStep: flow.ids[0] as string,
          completedSteps: [],
          skippedSteps: [],
          startedAt: at,
          completedAt: null,
          updatedAt: at,
        }),
        false
      );
    },
  };
}

export type Onboarding = ReturnType<typeof createOnboarding>;
