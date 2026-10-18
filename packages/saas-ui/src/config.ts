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
  };
}
