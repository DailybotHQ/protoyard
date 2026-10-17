import {
  type EnvironmentState,
  type OverrideController,
  type Overrides,
  OverridesSchema,
  type SimulationEnvironment,
} from '@protoyard/core';
import type { Kernel } from './kernel.ts';

export class InvalidOverrideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOverrideError';
  }
}

/**
 * Applies overrides synchronously (caches + derived state) and returns the
 * persistence promise. Overrides live only in the control DB: no code path
 * here can write a domain table.
 */
export function applyOverrides(k: Kernel, next: Overrides): Promise<void> {
  const value = normalizeOverrides(next);
  k.overrides = value;
  k.refreshDerived();
  k.events.overrides.emit(value);
  return k.writeControl({ overrides: Object.keys(value).length ? value : null });
}

/** Validates untrusted overrides (stored state, snapshot files); throws on invalid input. */
export function normalizeOverrides(input: unknown): Overrides {
  const parsed = OverridesSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new InvalidOverrideError(
      `Invalid override${issue ? ` ${issue.path.join('.')}: ${issue.message}` : ''}.`
    );
  }
  return prune(parsed.data, input as Overrides);
}

/**
 * Drops undefined keys and empty environment objects so "no override" is `{}`.
 * zod's `.partial()` still fills field defaults (network 'online', …), which
 * would silently override the scenario's environment, so only the
 * environment keys actually provided in `input` are kept.
 */
function prune(overrides: Overrides, input: Overrides): Overrides {
  const out: Record<string, unknown> = {};
  const providedEnv = new Set(Object.keys(input.environment ?? {}));
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    if (key === 'environment') {
      const env = Object.fromEntries(
        Object.entries(value as object).filter(
          ([field, v]) => v !== undefined && providedEnv.has(field)
        )
      );
      if (Object.keys(env).length === 0) continue;
      out[key] = env;
      continue;
    }
    out[key] = value;
  }
  return out as Overrides;
}

export function mergeOverrides(current: Overrides, patch: Overrides): Overrides {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key];
    } else if (key === 'environment') {
      next.environment = { ...current.environment, ...(value as object) };
    } else {
      next[key] = value;
    }
  }
  return next as Overrides;
}

export function createOverrideController(k: Kernel): OverrideController {
  return {
    get: () => k.overrides,
    set: async (patch) => applyOverrides(k, mergeOverrides(k.overrides, patch)),
    async clear(keys) {
      if (!keys) return applyOverrides(k, {});
      const next: Record<string, unknown> = { ...k.overrides };
      for (const key of keys) delete next[key];
      return applyOverrides(k, next as Overrides);
    },
    subscribe: (listener) => k.events.overrides.subscribe(listener),
  };
}

/**
 * `runtime.environment`: reads come from the effective state; writes become
 * `overrides.environment`, so a DevTools toggle survives reloads and the
 * scenario's own environment is restored by clearing it.
 */
export function createEnvironmentFacade(k: Kernel): SimulationEnvironment {
  return {
    get: () => k.env.get(),
    set(patch: Partial<EnvironmentState>) {
      const environment = { ...k.overrides.environment, ...patch };
      applyOverrides(k, { ...k.overrides, environment }).catch(k.report);
    },
    reset() {
      const { environment: _drop, ...rest } = k.overrides;
      applyOverrides(k, rest).catch(k.report);
    },
    isFeatureEnabled: (flag, fallback) => k.env.isFeatureEnabled(flag, fallback),
    run: (operation, fn) => k.env.run(operation, fn),
    subscribe: (listener) => k.env.subscribe(listener),
  };
}
