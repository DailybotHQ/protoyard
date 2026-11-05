import type { PrototypeRuntime } from '@protoyard/core';
import type { BillingService } from '@protoyard/saas';
import { getContext, hasContext, setContext } from 'svelte';
import {
  type AccountGateController,
  type AccountGateRequest,
  createAccountGate,
} from './account-gate/account-gate.svelte.ts';
import { type ResolvedSaasUiConfig, resolveSaasUiConfig, type SaasUiConfig } from './config.ts';
import { type SaasPorts, saasPortsFromRuntime } from './ports.ts';

const SAAS_UI_KEY = Symbol.for('protoyard.saas-ui');

/**
 * Kit context: the prototype runtime plus resolved path config.
 * Screens and guards read this via {@link getSaas}.
 */
export interface SaasContext {
  /**
   * The simulated engine. Screens that are not on ports yet (auth, settings,
   * onboarding, inbox, billing screens) read it; with `provideSaas({ ports })`
   * reading it throws a clear error instead.
   */
  runtime: PrototypeRuntime;
  /** What port-ready screens and guards read (ADR-046). */
  ports: SaasPorts;
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

/** `provideSaas({ ports })`: the kit on a product's own adapters, no simulated engine. */
export interface ProvideSaasPortsOptions extends SaasUiConfig {
  ports: SaasPorts;
}

const NO_RUNTIME =
  '[protoyard/saas-ui] This screen needs the simulated engine: call provideSaas(runtime, options). ' +
  'With provideSaas({ ports }) use the port-ready parts (guards, AccountGate, SsoButtons, TrialBanner, WorkspaceSwitcher).';

/**
 * Call once near the app root (inside the component tree that mounts the
 * router), after `provideRuntime` when you use both.
 *
 * ```ts
 * provideRuntime(runtime);
 * provideSaas(runtime, { lazy: true, billing: createBilling(runtime, catalog) });
 * // or, on a product's own session and services (ADR-046):
 * provideSaas({ ports: { session, now: () => Date.now(), workspaces } });
 * ```
 */
export function provideSaas(runtime: PrototypeRuntime, options?: ProvideSaasOptions): SaasContext;
export function provideSaas(options: ProvideSaasPortsOptions): SaasContext;
export function provideSaas(
  first: PrototypeRuntime | ProvideSaasPortsOptions,
  options: ProvideSaasOptions = {}
): SaasContext {
  const ctx = isPortsOptions(first) ? fromPorts(first) : fromRuntime(first, options);
  setContext(SAAS_UI_KEY, ctx);
  return ctx;
}

function isPortsOptions(
  value: PrototypeRuntime | ProvideSaasPortsOptions
): value is ProvideSaasPortsOptions {
  return 'ports' in value && !('session' in value);
}

function fromRuntime(runtime: PrototypeRuntime, options: ProvideSaasOptions): SaasContext {
  const { billing, ...config } = options;
  const accountGate = createAccountGate(runtime.session);
  return {
    runtime,
    ports: saasPortsFromRuntime(runtime, billing ? { billing } : {}),
    config: resolveSaasUiConfig(config),
    accountGate,
    requireAccount: accountGate.requireAccount,
    ...(billing ? { billing } : {}),
  };
}

function fromPorts({ ports, ...config }: ProvideSaasPortsOptions): SaasContext {
  const accountGate = createAccountGate(ports.session);
  const ctx = {
    ports,
    config: resolveSaasUiConfig(config),
    accountGate,
    requireAccount: accountGate.requireAccount,
    ...(ports.billing ? { billing: ports.billing } : {}),
  };
  Object.defineProperty(ctx, 'runtime', {
    enumerable: false,
    get() {
      throw new Error(NO_RUNTIME);
    },
  });
  return ctx as SaasContext;
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
