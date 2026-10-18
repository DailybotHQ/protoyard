import type { Principal, SessionController } from '@protoyard/core';
import {
  nextPath,
  type RouteGuard,
  type RouteMatch,
  redirectWithNext,
} from '@protoyard/renderer-svelte';
import type { ResolvedSaasUiConfig } from './config.ts';
import { DEFAULT_SAAS_UI_CONFIG } from './config.ts';

/**
 * Session surface the guards read. Matches `runtime.session` (simulated auth —
 * UX only, not security).
 */
export type SaasSessionLike = Pick<SessionController, 'isSignedIn' | 'principal' | 'can'>;

export interface GuardPathOptions {
  signInPath?: string;
  onboardingPath?: string;
  homePath?: string;
  /** Where to send someone who lacks a capability (default home). */
  forbiddenPath?: string;
}

function paths(options: GuardPathOptions = {}): Pick<
  ResolvedSaasUiConfig,
  'signInPath' | 'onboardingPath' | 'homePath'
> & {
  forbiddenPath: string;
} {
  return {
    signInPath: options.signInPath ?? DEFAULT_SAAS_UI_CONFIG.signInPath,
    onboardingPath: options.onboardingPath ?? DEFAULT_SAAS_UI_CONFIG.onboardingPath,
    homePath: options.homePath ?? DEFAULT_SAAS_UI_CONFIG.homePath,
    forbiddenPath: options.forbiddenPath ?? options.homePath ?? DEFAULT_SAAS_UI_CONFIG.homePath,
  };
}

function personaComplete(principal: Principal | null): boolean {
  return principal?.persona.onboardingComplete !== false;
}

/** Redirect signed-out visitors to sign-in, remembering `?next=`. */
export function requireAuth(session: SaasSessionLike, options: GuardPathOptions = {}): RouteGuard {
  const { signInPath } = paths(options);
  return (match: RouteMatch) => (session.isSignedIn() ? true : redirectWithNext(signInPath, match));
}

/**
 * Require a signed-in persona whose `onboardingComplete` is not false.
 * Incomplete onboarding goes to the wizard (no `next` stacking).
 */
export function requireOnboarded(
  session: SaasSessionLike,
  options: GuardPathOptions = {}
): RouteGuard {
  const { signInPath, onboardingPath } = paths(options);
  return (match: RouteMatch) => {
    if (!session.isSignedIn()) return redirectWithNext(signInPath, match);
    if (!personaComplete(session.principal())) return onboardingPath;
    return true;
  };
}

/** Require a simulated capability on the current principal. */
export function requireCapability(
  session: SaasSessionLike,
  capability: string,
  options: GuardPathOptions = {}
): RouteGuard {
  const { signInPath, forbiddenPath } = paths(options);
  return (match: RouteMatch) => {
    if (!session.isSignedIn()) return redirectWithNext(signInPath, match);
    if (!session.can(capability)) return forbiddenPath;
    return true;
  };
}

/**
 * Guest-only helper for sign-in / sign-up: once signed in, continue to `?next=`
 * or the home path.
 */
export function requireGuest(session: SaasSessionLike, options: GuardPathOptions = {}): RouteGuard {
  const { homePath } = paths(options);
  return (match: RouteMatch) => (session.isSignedIn() ? nextPath(match.query, homePath) : true);
}
