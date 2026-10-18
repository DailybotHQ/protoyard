import type { RouteDefinition } from '@protoyard/renderer-svelte';
import { DEFAULT_SAAS_UI_CONFIG, resolveSaasUiConfig, type SaasUiConfig } from './config.ts';
import {
  type GuardPathOptions,
  requireAuth,
  requireGuest,
  requireOnboarded,
  type SaasSessionLike,
} from './guards.ts';

export type SaasRouteGroup = 'auth' | 'oauth' | 'inbox' | 'onboarding' | 'billing';

export interface SaasRoutesOptions extends SaasUiConfig, GuardPathOptions {
  /**
   * Session used by guards (`runtime.session`). Required so redirects re-run
   * when you pass `revalidateOn: (r) => session.subscribe(r)` to createRouter.
   */
  session: SaasSessionLike;
  /**
   * When true (default), each screen is a separate chunk via `load`.
   * Set false only if you need a different loading strategy; screens still
   * use `load` so the initial bundle does not pull Svelte screen modules.
   */
  lazy?: boolean;
  /** Subset of kit route groups (default: all). */
  include?: readonly SaasRouteGroup[];
}

type ScreenLoader = () => Promise<{ default: NonNullable<RouteDefinition['component']> }>;

const LOADERS = {
  signIn: () => import('./screens/SignIn.svelte'),
  signUp: () => import('./screens/SignUp.svelte'),
  magicLink: () => import('./screens/MagicLink.svelte'),
  mfa: () => import('./screens/Mfa.svelte'),
  resetPassword: () => import('./screens/ResetPassword.svelte'),
  verifyEmail: () => import('./screens/VerifyEmail.svelte'),
  oauthConsent: () => import('./screens/OAuthConsent.svelte'),
  inbox: () => import('./screens/inbox/Inbox.svelte'),
  onboarding: () => import('./screens/Onboarding.svelte'),
  billingPlans: () => import('./screens/billing/Plans.svelte'),
  billingCheckout: () => import('./screens/billing/Checkout.svelte'),
  billingPortal: () => import('./screens/billing/Portal.svelte'),
} as const satisfies Record<string, ScreenLoader>;

/**
 * Drop-in route table for the simulated SaaS kit.
 *
 * ```ts
 * const routes = [
 *   ...saasRoutes({ session: runtime.session, lazy: true }),
 *   { path: '/', component: Home, guard: requireSaasApp(runtime.session) },
 * ];
 * createRouter(routes, {
 *   revalidateOn: (refresh) => runtime.session.subscribe(refresh),
 * });
 * ```
 *
 * Lazy by default: guards stay in the main chunk; each screen is its own
 * async chunk until opened (0 KB of screen UI in the initial JS).
 */
export function saasRoutes(options: SaasRoutesOptions): RouteDefinition[] {
  const config = resolveSaasUiConfig({
    ...options,
    lazy: options.lazy ?? DEFAULT_SAAS_UI_CONFIG.lazy,
  });
  const session = options.session;
  const guardOpts: GuardPathOptions = {
    signInPath: config.signInPath,
    onboardingPath: config.onboardingPath,
    homePath: config.homePath,
    ...(options.forbiddenPath !== undefined ? { forbiddenPath: options.forbiddenPath } : {}),
  };
  const groups = new Set<SaasRouteGroup>(
    options.include ?? ['auth', 'oauth', 'inbox', 'onboarding', 'billing']
  );

  const route = (
    path: string,
    title: string,
    loader: ScreenLoader,
    guard?: RouteDefinition['guard']
  ): RouteDefinition => ({
    path,
    title,
    // Always use load so Vite can split chunks; `lazy: false` is reserved for
    // future eager wiring and still does not static-import screens here.
    load: loader,
    ...(guard ? { guard } : {}),
  });

  void config.lazy;

  const routes: RouteDefinition[] = [];

  if (groups.has('auth')) {
    routes.push(
      route(config.signInPath, 'Sign in', LOADERS.signIn, requireGuest(session, guardOpts)),
      route(config.signUpPath, 'Sign up', LOADERS.signUp, requireGuest(session, guardOpts)),
      route('/auth/magic', 'Magic link', LOADERS.magicLink),
      route('/auth/mfa', 'Multi-factor', LOADERS.mfa, requireAuth(session, guardOpts)),
      route('/auth/reset', 'Reset password', LOADERS.resetPassword),
      route('/auth/verify', 'Verify email', LOADERS.verifyEmail)
    );
  }

  if (groups.has('oauth')) {
    routes.push(route('/oauth/consent', 'Provider consent', LOADERS.oauthConsent));
  }

  if (groups.has('inbox')) {
    routes.push(route(config.inboxPath, 'Inbox', LOADERS.inbox, requireAuth(session, guardOpts)));
  }

  if (groups.has('onboarding')) {
    routes.push(
      route(
        config.onboardingPath,
        'Onboarding',
        LOADERS.onboarding,
        requireAuth(session, guardOpts)
      )
    );
  }

  if (groups.has('billing')) {
    routes.push(
      route(
        config.billingPlansPath,
        'Plans',
        LOADERS.billingPlans,
        requireAuth(session, guardOpts)
      ),
      route(
        config.billingCheckoutPath,
        'Checkout',
        LOADERS.billingCheckout,
        requireAuth(session, guardOpts)
      ),
      route(
        config.billingPortalPath,
        'Billing portal',
        LOADERS.billingPortal,
        requireAuth(session, guardOpts)
      )
    );
  }

  return routes;
}

/** Resolve every kit screen component (tests / tooling). */
export async function resolveEagerSaasScreens(): Promise<
  Record<keyof typeof LOADERS, NonNullable<RouteDefinition['component']>>
> {
  const entries = await Promise.all(
    (Object.keys(LOADERS) as (keyof typeof LOADERS)[]).map(async (key) => {
      const mod = await LOADERS[key]();
      return [key, mod.default] as const;
    })
  );
  return Object.fromEntries(entries) as unknown as Record<
    keyof typeof LOADERS,
    NonNullable<RouteDefinition['component']>
  >;
}

/** Protected app shell helper: signed in + finished onboarding. */
export function requireSaasApp(
  session: SaasSessionLike,
  options: GuardPathOptions = {}
): NonNullable<RouteDefinition['guard']> {
  return requireOnboarded(session, options);
}
