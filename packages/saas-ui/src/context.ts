import type { PrototypeRuntime } from '@protoyard/core';
import type { BillingService } from '@protoyard/saas';
import { getContext, hasContext, setContext } from 'svelte';
import {
  type AccountGateController,
  type AccountGateRequest,
  createAccountGate,
} from './account-gate/account-gate.svelte.ts';
import { type ResolvedSaasUiConfig, resolveSaasUiConfig, type SaasUiConfig } from './config.ts';

const SAAS_UI_KEY = Symbol.for('protoyard.saas-ui');

/**
 * Kit context: the prototype runtime plus resolved path config.
 * Screens and guards read this via {@link getSaas}.
 */
export interface SaasContext {
  runtime: PrototypeRuntime;
  config: ResolvedSaasUiConfig;
  /** Per-prototype just-in-time account prompt; UX only, never authorization. */
  accountGate: AccountGateController;
  /** Check an action at the moment it happens; false means the gate was opened. */
  requireAccount: (request: AccountGateRequest) => boolean;
  /** Optional simulated billing engine for plans / checkout / portal. */
  billing?: BillingService;
}

export interface ProvideSaasOptions extends SaasUiConfig {
  billing?: BillingService;
}

/**
 * Call once near the app root (inside the component tree that mounts the
 * router), after `provideRuntime` when you use both.
 *
 * ```ts
 * provideRuntime(runtime);
 * provideSaas(runtime, { lazy: true, billing: createBilling(runtime, catalog) });
 * ```
 */
export function provideSaas(
  runtime: PrototypeRuntime,
  options: ProvideSaasOptions = {}
): SaasContext {
  const { billing, ...config } = options;
  const accountGate = createAccountGate(runtime.session);
  const ctx: SaasContext = {
    runtime,
    config: resolveSaasUiConfig(config),
    accountGate,
    requireAccount: accountGate.requireAccount,
    ...(billing ? { billing } : {}),
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
