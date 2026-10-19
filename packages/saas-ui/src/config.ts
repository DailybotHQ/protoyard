import type { SaasProvider } from '@protoyard/saas';

/** The account a sign-up just created (what the inbox hand-off link needs). */
export interface SaasPendingAccount {
  id: string;
  email: string;
}

/** Paths and feature flags for the simulated SaaS kit UI. */
export interface SaasUiConfig {
  /** Default `/sign-in`. */
  signInPath?: string;
  /** Default `/sign-up`. */
  signUpPath?: string;
  /** Default `/onboarding`. */
  onboardingPath?: string;
  /** Where to land after sign-in when no `?next=` (default `/`). */
  homePath?: string;
  /** Default `/inbox`. */
  inboxPath?: string;
  /** Default `/billing/plans`. */
  billingPlansPath?: string;
  /** Default `/billing/checkout`. */
  billingCheckoutPath?: string;
  /** Default `/billing/portal`. */
  billingPortalPath?: string;
  /**
   * When true, checkout shows the simulator outcome picker (DevTools / scenario).
   * Default false for published reviewer builds.
   */
  billingShowOutcomePicker?: boolean;
  /** When false, route screens are imported eagerly (tests). Default true. */
  lazy?: boolean;
  /**
   * Simulated SSO providers offered on the sign-in and sign-up screens
   * ("Continue with …"). Default none, so the screens show no SSO buttons.
   */
  ssoProviders?: readonly SaasProvider[];
  /**
   * When set, the sign-up confirmation offers "Open simulated inbox" with this
   * href (an in-app `#/…` route the host serves for a signed-out, unverified
   * account). Default unset: no inbox link after sign-up.
   */
  signUpInboxHref?: (account: SaasPendingAccount) => string;
}

export interface ResolvedSaasUiConfig {
  signInPath: string;
  signUpPath: string;
  onboardingPath: string;
  homePath: string;
  inboxPath: string;
  billingPlansPath: string;
  billingCheckoutPath: string;
  billingPortalPath: string;
  billingShowOutcomePicker: boolean;
  lazy: boolean;
  ssoProviders: readonly SaasProvider[];
  signUpInboxHref?: (account: SaasPendingAccount) => string;
}

export const DEFAULT_SAAS_UI_CONFIG: ResolvedSaasUiConfig = {
  signInPath: '/sign-in',
  signUpPath: '/sign-up',
  onboardingPath: '/onboarding',
  homePath: '/',
  inboxPath: '/inbox',
  billingPlansPath: '/billing/plans',
  billingCheckoutPath: '/billing/checkout',
  billingPortalPath: '/billing/portal',
  billingShowOutcomePicker: false,
  lazy: true,
  ssoProviders: [],
};

export function resolveSaasUiConfig(config: SaasUiConfig = {}): ResolvedSaasUiConfig {
  return {
    signInPath: config.signInPath ?? DEFAULT_SAAS_UI_CONFIG.signInPath,
    signUpPath: config.signUpPath ?? DEFAULT_SAAS_UI_CONFIG.signUpPath,
    onboardingPath: config.onboardingPath ?? DEFAULT_SAAS_UI_CONFIG.onboardingPath,
    homePath: config.homePath ?? DEFAULT_SAAS_UI_CONFIG.homePath,
    inboxPath: config.inboxPath ?? DEFAULT_SAAS_UI_CONFIG.inboxPath,
    billingPlansPath: config.billingPlansPath ?? DEFAULT_SAAS_UI_CONFIG.billingPlansPath,
    billingCheckoutPath: config.billingCheckoutPath ?? DEFAULT_SAAS_UI_CONFIG.billingCheckoutPath,
    billingPortalPath: config.billingPortalPath ?? DEFAULT_SAAS_UI_CONFIG.billingPortalPath,
    billingShowOutcomePicker:
      config.billingShowOutcomePicker ?? DEFAULT_SAAS_UI_CONFIG.billingShowOutcomePicker,
    lazy: config.lazy ?? DEFAULT_SAAS_UI_CONFIG.lazy,
    ssoProviders: config.ssoProviders ?? DEFAULT_SAAS_UI_CONFIG.ssoProviders,
    ...(config.signUpInboxHref ? { signUpInboxHref: config.signUpInboxHref } : {}),
  };
}
