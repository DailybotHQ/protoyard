import type {
  ActiveScenarioInfo,
  AppearanceState,
  ClockState,
  EnvironmentState,
  LoadProgress,
  Overrides,
  Principal,
  PrototypeRuntime,
  Theme,
} from '@protoyard/core';

/**
 * One reactive mirror of the runtime for the whole panel. Every value is
 * re-read from its controller on change (never from the listener payload),
 * so the panel always shows what the runtime would report right now.
 */
export interface DevtoolsState {
  readonly runtime: PrototypeRuntime;
  readonly themes: readonly Theme[];
  readonly principal: Principal | null;
  readonly appearance: AppearanceState;
  readonly active: ActiveScenarioInfo | null;
  readonly overrides: Overrides;
  readonly environment: EnvironmentState;
  readonly clock: ClockState;
  /** Scenario load in flight (any caller), or null. */
  readonly progress: LoadProgress | null;
  /** Bumps whenever the world may have changed (scenario load, snapshot restore, advance). */
  readonly worldVersion: number;
  touchWorld(): void;
  /** Transient feedback line announced through an aria-live region. */
  readonly status: { kind: 'info' | 'success' | 'error'; text: string } | null;
  notify(kind: 'info' | 'success' | 'error', text: string): void;
  /**
   * Runs an action with busy tracking and error reporting. Keys are
   * `group:item` (`persona:user_0002`, `appearance:theme:ocean`): the item
   * shows a spinner, the whole group is disabled, and a failure is kept as
   * the group's inline error until its next action.
   */
  run<T>(key: string, fn: () => Promise<T> | T, success?: string): Promise<T | undefined>;
  /** True while `key` runs, or (for a group like `persona`) while any key in it runs. */
  isBusy(key: string): boolean;
  /** Last failure of a group (`persona`, `scenario`, `env`…), shown inline. */
  errorFor(group: string): string | null;
  /** Something is in flight: a panel action, a runtime operation or a scenario load. */
  readonly working: boolean;
  destroy(): void;
}

export function createDevtoolsState(
  runtime: PrototypeRuntime,
  themes: readonly Theme[]
): DevtoolsState {
  let principal = $state.raw(runtime.session.principal());
  let appearance = $state.raw(runtime.theme.appearance());
  let active = $state.raw(runtime.scenarios.active());
  let overrides = $state.raw(runtime.overrides.get());
  let environment = $state.raw(runtime.environmentState());
  let clock = $state.raw(runtime.clock.getState());
  let progress = $state.raw<LoadProgress | null>(runtime.scenarios.progress?.() ?? null);
  let worldVersion = $state(0);
  let status = $state.raw<DevtoolsState['status']>(null);
  const busy = $state<Record<string, boolean>>({});
  const errors = $state<Record<string, string>>({});
  let runtimePending = $state(runtime.pending?.count() ?? 0);
  const groupOf = (key: string) => key.split(':')[0] ?? key;
  let statusTimer: ReturnType<typeof setTimeout> | undefined;

  const refreshEnv = () => {
    environment = runtime.environmentState();
  };
  const offs = [
    runtime.session.subscribe(() => {
      principal = runtime.session.principal();
    }),
    runtime.theme.subscribe(() => {
      appearance = runtime.theme.appearance();
    }),
    runtime.scenarios.subscribe(() => {
      active = runtime.scenarios.active();
      worldVersion++;
    }),
    runtime.overrides.subscribe(() => {
      overrides = runtime.overrides.get();
      refreshEnv();
    }),
    runtime.environment.subscribe(refreshEnv),
    runtime.clock.subscribe(() => {
      clock = runtime.clock.getState();
    }),
    runtime.pending?.subscribe((ops) => {
      runtimePending = ops.length;
    }) ?? (() => {}),
    // Optional chaining keeps older runtimes (before the progress API) working.
    runtime.scenarios.subscribeProgress?.((next) => {
      progress = next;
    }) ?? (() => {}),
  ];

  const notify: DevtoolsState['notify'] = (kind, text) => {
    status = { kind, text };
    clearTimeout(statusTimer);
    statusTimer = setTimeout(
      () => {
        status = null;
      },
      kind === 'error' ? 8000 : 4000
    );
  };

  return {
    runtime,
    themes,
    get principal() {
      return principal;
    },
    get appearance() {
      return appearance;
    },
    get active() {
      return active;
    },
    get overrides() {
      return overrides;
    },
    get environment() {
      return environment;
    },
    get clock() {
      return clock;
    },
    get progress() {
      return progress;
    },
    get worldVersion() {
      return worldVersion;
    },
    touchWorld() {
      worldVersion++;
    },
    get status() {
      return status;
    },
    notify,
    async run(key, fn, success) {
      const group = groupOf(key);
      busy[key] = true;
      delete errors[group];
      try {
        const result = await fn();
        if (success) notify('success', success);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors[group] = message;
        notify('error', message);
        return undefined;
      } finally {
        busy[key] = false;
      }
    },
    isBusy: (key) =>
      Object.entries(busy).some(([k, on]) => on && (k === key || k.startsWith(`${key}:`))),
    errorFor: (group) => errors[group] ?? null,
    get working() {
      return Object.values(busy).some(Boolean) || runtimePending > 0 || progress !== null;
    },
    destroy() {
      clearTimeout(statusTimer);
      for (const off of offs) off();
    },
  };
}
