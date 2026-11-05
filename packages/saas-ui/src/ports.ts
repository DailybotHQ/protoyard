import type { PrototypeRuntime, SessionController } from '@protoyard/core';
import {
  type BillingService,
  createOAuthSimulator,
  createWorkspaces,
  type OAuthIntent,
  type OAuthProviderScenarios,
  type SaasProvider,
  type WorkspacesRuntime,
  type WorkspacesService,
} from '@protoyard/saas';

/**
 * Ports for the SaaS kit (ADR-046): the narrow interfaces the screens read, so
 * a product's own session, clock and services can drive them without the
 * simulated engine. `saasPortsFromRuntime(runtime)` builds them from a
 * Protoyard runtime; a plain object works just as well. Simulated sign-in is
 * UX only, never security.
 */

/** The signed-in person as the kit sees them. */
export interface SessionPrincipal {
  id: string;
  name?: string;
  email?: string;
  /** `false` sends guarded routes to onboarding; missing counts as complete. */
  onboardingComplete?: boolean;
  /** The active workspace, if the product has workspaces. */
  organization?: { id: string; name: string } | null;
}

export interface SessionPort {
  isSignedIn(): boolean;
  principal(): SessionPrincipal | null;
  can(capability: string, resource?: unknown): boolean;
  /** Calls `listener` after every sign-in, sign-out or workspace change. Returns an unsubscribe. */
  subscribe(listener: (principal: SessionPrincipal | null) => void): () => void;
}

/** Starts a (simulated or real) provider sign-in and names the route to continue to. */
export interface OAuthPort {
  start(provider: SaasProvider, intent: OAuthIntent): Promise<{ route: string }>;
}

/** One workspace the signed-in person belongs to. */
export interface WorkspaceEntry {
  organization: { id: string; name: string };
}

/**
 * The workspace operations `WorkspaceSwitcher` uses. The simulated
 * `WorkspacesService` satisfies it; so does a product's own client.
 */
export interface WorkspacesPort {
  list(): readonly WorkspaceEntry[];
  switchTo(organizationId: string): Promise<void>;
  /** Create a workspace and make it the active one. */
  create(input: { name: string }): Promise<WorkspaceEntry>;
}

/** The billing reads `TrialBanner` and the billing screens use. */
export type BillingPort = BillingService;

export interface SaasPorts {
  session: SessionPort;
  /** Current time in epoch ms (a simulated clock in prototypes). */
  now(): number;
  billing?: BillingPort;
  oauth?: OAuthPort;
  workspaces?: WorkspacesPort;
}

/** A Protoyard `Principal` as a `SessionPrincipal`. */
function toSessionPrincipal(
  principal: ReturnType<SessionController['principal']>
): SessionPrincipal | null {
  if (!principal) return null;
  const { persona, organization } = principal;
  return {
    id: persona.id,
    name: persona.name,
    ...(persona.email ? { email: persona.email } : {}),
    ...(persona.onboardingComplete === undefined
      ? {}
      : { onboardingComplete: persona.onboardingComplete }),
    organization: organization ? { id: organization.id, name: organization.name } : null,
  };
}

/** The runtime's simulated session as a `SessionPort`. */
export function sessionPortFromRuntime(
  session: Pick<SessionController, 'isSignedIn' | 'principal' | 'can' | 'subscribe'>
): SessionPort {
  return {
    isSignedIn: () => session.isSignedIn(),
    principal: () => toSessionPrincipal(session.principal()),
    can: (capability, resource) => session.can(capability, resource),
    subscribe: (listener) =>
      session.subscribe((principal) => listener(toSessionPrincipal(principal))),
  };
}

export interface SaasPortsFromRuntimeOptions {
  billing?: BillingService;
  /** Scenario identities and outcomes for the simulated OAuth providers. */
  oauthScenarios?: OAuthProviderScenarios;
}

/** Every SaaS port, built on the simulated engine of a Protoyard runtime. */
export function saasPortsFromRuntime(
  runtime: PrototypeRuntime,
  options: SaasPortsFromRuntimeOptions = {}
): SaasPorts {
  let workspaces: WorkspacesService | undefined;
  const lazyWorkspaces = (): WorkspacesService => {
    workspaces ??= createWorkspaces(runtime as WorkspacesRuntime);
    return workspaces;
  };
  return {
    session: sessionPortFromRuntime(runtime.session),
    now: () => runtime.clock.nowMs(),
    ...(options.billing ? { billing: options.billing } : {}),
    oauth: {
      start: async (provider, intent) => {
        const result = await createOAuthSimulator(
          runtime as Parameters<typeof createOAuthSimulator>[0],
          options.oauthScenarios ?? {}
        ).start(provider, intent);
        return { route: result.route };
      },
    },
    workspaces: {
      list: () => lazyWorkspaces().list(),
      switchTo: (id) => lazyWorkspaces().switchTo(id),
      create: (input) => lazyWorkspaces().create(input),
    },
  };
}
