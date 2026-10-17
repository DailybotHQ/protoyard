import { z } from 'zod';
import { createRng, hashString } from './random.ts';

/**
 * A deliberately small environment simulator. It only affects services that
 * route their work through `environment.run(...)` — it does NOT block native
 * browser networking (documented in docs/SCENARIOS.md → "Environment").
 */

export const NetworkModeSchema = z.enum(['online', 'offline', 'slow']);
export type NetworkMode = z.infer<typeof NetworkModeSchema>;

export const FailureModeSchema = z.enum([
  'none',
  'timeout',
  'server-error',
  'permission-denied',
  'rate-limited',
]);
export type FailureMode = z.infer<typeof FailureModeSchema>;

export const SubscriptionStatusSchema = z.enum(['free', 'trial', 'pro', 'enterprise', 'expired']);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const EnvironmentStateSchema = z.object({
  network: NetworkModeSchema.default('online'),
  /** Added to every simulated operation (ms). `slow` adds a further 1200ms. */
  latencyMs: z.number().int().min(0).max(30_000).default(0),
  failureMode: FailureModeSchema.default('none'),
  /** 0..1 — share of operations that fail with `failureMode`. 1 = always. */
  failureRate: z.number().min(0).max(1).default(1),
  subscription: SubscriptionStatusSchema.optional(),
  featureFlags: z.record(z.string(), z.boolean()).default({}),
});
export type EnvironmentState = z.infer<typeof EnvironmentStateSchema>;

export const DEFAULT_ENVIRONMENT: EnvironmentState = {
  network: 'online',
  latencyMs: 0,
  failureMode: 'none',
  failureRate: 1,
  featureFlags: {},
};

export const SLOW_NETWORK_EXTRA_MS = 1200;

export type SimulatedErrorCode = Exclude<FailureMode, 'none'> | 'offline';

export class SimulatedServiceError extends Error {
  constructor(
    readonly code: SimulatedErrorCode,
    readonly operation: string
  ) {
    super(SIMULATED_ERROR_MESSAGES[code]);
    this.name = 'SimulatedServiceError';
  }
}

export const SIMULATED_ERROR_MESSAGES: Record<SimulatedErrorCode, string> = {
  offline: 'You are offline (simulated). Changes were not saved.',
  timeout: 'The request timed out (simulated). Please try again.',
  'server-error': 'Something went wrong on the server (simulated 500).',
  'permission-denied': 'The server rejected this action (simulated 403).',
  'rate-limited': 'Too many requests (simulated 429). Wait a moment and retry.',
};

export interface SimulationEnvironment {
  get(): EnvironmentState;
  set(patch: Partial<EnvironmentState>): void;
  reset(): void;
  isFeatureEnabled(flag: string, fallback?: boolean): boolean;
  /**
   * Runs a simulated service operation: applies latency, then the configured
   * offline/failure mode (reproducibly, keyed by operation name + call count),
   * then the operation itself.
   */
  run<T>(operation: string, fn: () => T | Promise<T>): Promise<T>;
  subscribe(listener: (state: EnvironmentState) => void): () => void;
}

export interface EnvironmentOptions {
  initial?: Partial<EnvironmentState>;
  /** Injected for tests; defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  ms <= 0 ? Promise.resolve() : new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createSimulationEnvironment(
  options: EnvironmentOptions = {}
): SimulationEnvironment {
  const sleep = options.sleep ?? defaultSleep;
  let state: EnvironmentState = { ...DEFAULT_ENVIRONMENT, ...options.initial };
  const listeners = new Set<(state: EnvironmentState) => void>();
  const callCounts = new Map<string, number>();
  const emit = () => {
    for (const listener of listeners) listener(state);
  };

  return {
    get: () => state,
    set(patch) {
      state = EnvironmentStateSchema.parse({ ...state, ...patch });
      emit();
    },
    reset() {
      state = { ...DEFAULT_ENVIRONMENT, ...options.initial };
      callCounts.clear();
      emit();
    },
    isFeatureEnabled(flag, fallback = false) {
      return state.featureFlags[flag] ?? fallback;
    },
    async run(operation, fn) {
      const latency = state.latencyMs + (state.network === 'slow' ? SLOW_NETWORK_EXTRA_MS : 0);
      await sleep(latency);
      if (state.network === 'offline') throw new SimulatedServiceError('offline', operation);
      if (state.failureMode !== 'none') {
        const count = (callCounts.get(operation) ?? 0) + 1;
        callCounts.set(operation, count);
        const roll = createRng(hashString(`${operation}#${count}`)).next();
        if (roll < state.failureRate) throw new SimulatedServiceError(state.failureMode, operation);
      }
      return await fn();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
