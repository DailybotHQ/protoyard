import type { PrototypeRuntime } from '@protoyard/core';
import { getContext, hasContext, setContext } from 'svelte';
import { type ResolvedSaasUiConfig, resolveSaasUiConfig, type SaasUiConfig } from './config.ts';

const SAAS_UI_KEY = Symbol.for('protoyard.saas-ui');

/**
 * Kit context: the prototype runtime plus resolved path config.
 * Screens and guards read this via {@link getSaas}.
 */
export interface SaasContext {
  runtime: PrototypeRuntime;
  config: ResolvedSaasUiConfig;
}

/**
 * Call once near the app root (inside the component tree that mounts the
 * router), after `provideRuntime` when you use both.
 *
 * ```ts
 * provideRuntime(runtime);
 * provideSaas(runtime, { lazy: true });
 * ```
 */
export function provideSaas(runtime: PrototypeRuntime, config: SaasUiConfig = {}): SaasContext {
  const ctx: SaasContext = {
    runtime,
    config: resolveSaasUiConfig(config),
  };
  setContext(SAAS_UI_KEY, ctx);
  return ctx;
}

/** The kit context from the nearest `provideSaas` call. */
export function getSaas(): SaasContext {
  if (!hasContext(SAAS_UI_KEY)) {
    throw new Error(
      '[protoyard/saas-ui] No SaaS context. Call provideSaas(runtime, config) in a parent component.'
    );
  }
  return getContext<SaasContext>(SAAS_UI_KEY);
}

export function hasSaas(): boolean {
  try {
    return hasContext(SAAS_UI_KEY);
  } catch {
    return false;
  }
}
