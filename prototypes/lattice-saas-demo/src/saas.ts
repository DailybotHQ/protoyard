import {
  type RouteDefinition,
  type RouteGuard,
  redirectWithNext,
} from '@protoyard/renderer-svelte';
import type { SaasProvider } from '@protoyard/saas';
import {
  requireAuth,
  requireSaasApp,
  type SaasSessionLike,
  type SaasUiConfig,
  saasRoutes,
} from '@protoyard/saas-ui';
import { pendingInboxHref } from './domain/pending-inbox.ts';

/**
 * How Lattice wires the SaaS kit screens: paths, the simulated SSO providers
 * on sign-in and sign-up, the sign-up hand-off to the pending inbox, and the
 * two routes Lattice serves itself (`/inbox`, `/onboarding`).
 */

export const LATTICE_PATHS = {
  signInPath: '/sign-in',
  homePath: '/app',
  onboardingPath: '/onboarding',
} as const;

/** "Continue with …" buttons (simulated OAuth; no provider is contacted). */
export const LATTICE_SSO_PROVIDERS = [
  'google',
  'microsoft',
  'github',
] as const satisfies readonly SaasProvider[];

export const LATTICE_SAAS_UI: SaasUiConfig = {
  ...LATTICE_PATHS,
  ssoProviders: LATTICE_SSO_PROVIDERS,
  signUpInboxHref: pendingInboxHref,
};

/**
 * `/inbox`: a signed-in persona reads its inbox; a signed-out visitor may open
 * it only with `?account=` (a pending sign-up), and the screen then shows
 * that account's own messages if it is still unverified.
 */
export function inboxGuard(session: SaasSessionLike): RouteGuard {
  return (match) =>
    session.isSignedIn() || (match.query.get('account') ?? '').trim() !== ''
      ? true
      : redirectWithNext(LATTICE_PATHS.signInPath, match);
}

/** The app routes after the landing page: kit screens plus Lattice's own. */
export function latticeRoutes(
  session: SaasSessionLike,
  screens: {
    dashboard: NonNullable<RouteDefinition['component']>;
    projects: NonNullable<RouteDefinition['component']>;
  }
): RouteDefinition[] {
  const appGuard = requireSaasApp(session, LATTICE_PATHS);
  return [
    { path: '/', component: screens.dashboard, title: 'Plan your work' },
    ...saasRoutes({
      session,
      ...LATTICE_PATHS,
      lazy: true,
      // Lattice serves `/inbox` and `/onboarding` itself (below).
      include: ['auth', 'oauth', 'billing', 'settings', 'invites'],
    }),
    {
      path: '/inbox',
      title: 'Inbox',
      load: () => import('./screens/Inbox.svelte'),
      guard: inboxGuard(session),
    },
    {
      path: LATTICE_PATHS.onboardingPath,
      title: 'Onboarding',
      load: () => import('./screens/Onboarding.svelte'),
      guard: requireAuth(session, LATTICE_PATHS),
    },
    { path: '/app', component: screens.dashboard, title: 'Overview', guard: appGuard },
    { path: '/projects', component: screens.projects, title: 'Projects', guard: appGuard },
  ];
}
