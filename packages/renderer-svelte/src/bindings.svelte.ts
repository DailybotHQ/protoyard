import type {
  ActiveScenarioInfo,
  AppearanceState,
  ClockState,
  EnvironmentState,
  Overrides,
  Principal,
  PrototypeRuntime,
  Scenario,
} from '@protoyard/core';
import { liveQuery as dexieLiveQuery } from 'dexie';
import { createSubscriber } from 'svelte/reactivity';
import { getRuntime } from './context.ts';

/**
 * Reactive views over the framework-agnostic runtime controllers. Each hook
 * returns an object whose getters re-read the controller and register a
 * subscription only while something reactive is reading them, so they work
 * in components, `$derived` and `$effect` without leaking listeners.
 */

type Subscribe = (notify: () => void) => () => void;

export interface Reactive<T> {
  readonly current: T;
}

export function fromController<T>(read: () => T, subscribe: Subscribe): Reactive<T> {
  const track = createSubscriber((update) => subscribe(update));
  return {
    get current() {
      track();
      return read();
    },
  };
}

function runtimeOr(runtime?: PrototypeRuntime): PrototypeRuntime {
  return runtime ?? getRuntime();
}

export function usePrincipal(runtime?: PrototypeRuntime): Reactive<Principal | null> {
  const rt = runtimeOr(runtime);
  return fromController(
    () => rt.session.principal(),
    (notify) => rt.session.subscribe(notify)
  );
}

export interface ScenarioView {
  readonly active: ActiveScenarioInfo | null;
  readonly list: readonly Scenario[];
}

export function useScenario(runtime?: PrototypeRuntime): ScenarioView {
  const rt = runtimeOr(runtime);
  const active = fromController(
    () => rt.scenarios.active(),
    (notify) => rt.scenarios.subscribe(notify)
  );
  return {
    get active() {
      return active.current;
    },
    get list() {
      return rt.scenarios.list();
    },
  };
}

export function useAppearance(runtime?: PrototypeRuntime): Reactive<AppearanceState> {
  const rt = runtimeOr(runtime);
  return fromController(
    () => rt.theme.appearance(),
    (notify) => rt.theme.subscribe(notify)
  );
}

/** Effective environment (scenario + overrides); updates on either change. */
export function useEnvironment(runtime?: PrototypeRuntime): Reactive<EnvironmentState> {
  const rt = runtimeOr(runtime);
  return fromController(
    () => rt.environmentState(),
    (notify) => {
      const offEnv = rt.environment.subscribe(notify);
      const offOverrides = rt.overrides.subscribe(notify);
      return () => {
        offEnv();
        offOverrides();
      };
    }
  );
}

export function useOverrides(runtime?: PrototypeRuntime): Reactive<Overrides> {
  const rt = runtimeOr(runtime);
  return fromController(
    () => rt.overrides.get(),
    (notify) => rt.overrides.subscribe(notify)
  );
}

export interface ClockView {
  readonly now: Date;
  readonly committed: Date;
  readonly reference: Date;
  readonly previewing: boolean;
  readonly state: ClockState;
}

/**
 * Simulated time. While the clock is `running`, readers are refreshed every
 * `tickMs` so relative labels ("2 minutes ago") keep moving.
 */
export function useClock(runtime?: PrototypeRuntime, tickMs = 30_000): ClockView {
  const rt = runtimeOr(runtime);
  const view = fromController(
    () => rt.clock.getState(),
    (notify) => {
      const off = rt.clock.subscribe(notify);
      const timer = setInterval(() => {
        if (rt.clock.getState().running) notify();
      }, tickMs);
      return () => {
        off();
        clearInterval(timer);
      };
    }
  );
  return {
    get state() {
      return view.current;
    },
    get now() {
      view.current;
      return rt.clock.now();
    },
    get committed() {
      view.current;
      return rt.clock.committed();
    },
    get reference() {
      view.current;
      return rt.clock.reference();
    },
    get previewing() {
      view.current;
      return rt.clock.isPreviewing();
    },
  };
}

/**
 * Reactive permission check: `{#if can('deals:update', deal)}`. It re-runs
 * when the principal changes. Services must still call `session.assert`.
 */
export function can(capability: string, resource?: unknown, runtime?: PrototypeRuntime): boolean {
  const rt = runtimeOr(runtime);
  principalTracker(rt)();
  return rt.session.can(capability, resource);
}

const trackers = new WeakMap<PrototypeRuntime, () => void>();
function principalTracker(rt: PrototypeRuntime): () => void {
  let track = trackers.get(rt);
  if (!track) {
    track = createSubscriber((update) => rt.session.subscribe(update));
    trackers.set(rt, track);
  }
  return track;
}

export interface LiveQuery<T> {
  readonly current: T | undefined;
  readonly loading: boolean;
  readonly error: unknown;
}

export interface LiveQueryOptions<T> {
  /** Value exposed as `current` until the first result arrives. */
  initial?: T;
  /**
   * Extra reactive inputs: `deps: () => [id, stage]`. Reads the querier does
   * synchronously (before its first `await`) are tracked automatically; list
   * here anything it only reads AFTER an await, which Svelte cannot see.
   */
  deps?: () => unknown;
}

/**
 * Svelte wrapper around Dexie's `liveQuery`: re-runs when the queried tables
 * change (including scenario loads and snapshot restores) and when its
 * reactive inputs change (read synchronously by the querier, or listed in `deps`). Must be called during component initialisation
 * (it owns an `$effect`).
 *
 *   const deals = liveQuery(() => db.deals.where('stage').equals(stage).toArray(), {
 *     initial: [],
 *     deps: () => stage,
 *   });
 *   {#each deals.current ?? [] as deal}…{/each}
 */
export function liveQuery<T>(
  querier: () => T | Promise<T>,
  options: LiveQueryOptions<T> = {}
): LiveQuery<T> {
  let current = $state<T | undefined>(options.initial);
  let loading = $state(true);
  let error = $state<unknown>(undefined);

  $effect(() => {
    options.deps?.();
    // Svelte tracks what the querier reads synchronously — but only while it
    // runs inside this effect. Dexie runs the first query synchronously during
    // subscribe() when it can; when it defers (an active Dexie zone, common
    // after awaits), one tracking probe runs here so route params and filters
    // still re-subscribe. Cost: at most one extra query per (re)subscription,
    // never per data change; pass `deps` to skip it on very large tables.
    let subscribing = true;
    let ranInside = false;
    const tracked = () => {
      if (subscribing) ranInside = true;
      return querier();
    };
    loading = true;
    const subscription = dexieLiveQuery(tracked).subscribe({
      next(value) {
        current = value;
        error = undefined;
        loading = false;
      },
      error(err) {
        error = err;
        loading = false;
      },
    });
    subscribing = false;
    if (!ranInside && !options.deps) {
      const probe = querier();
      if (probe instanceof Promise) probe.catch(() => {});
    }
    return () => subscription.unsubscribe();
  });

  return {
    get current() {
      return current;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
  };
}
