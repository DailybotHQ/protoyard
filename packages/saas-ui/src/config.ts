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
  /** When false, route screens are imported eagerly (tests). Default true. */
  lazy?: boolean;
}

export interface ResolvedSaasUiConfig {
  signInPath: string;
  signUpPath: string;
  onboardingPath: string;
  homePath: string;
  inboxPath: string;
  lazy: boolean;
}

export const DEFAULT_SAAS_UI_CONFIG: ResolvedSaasUiConfig = {
  signInPath: '/sign-in',
  signUpPath: '/sign-up',
  onboardingPath: '/onboarding',
  homePath: '/',
  inboxPath: '/inbox',
  lazy: true,
};

export function resolveSaasUiConfig(config: SaasUiConfig = {}): ResolvedSaasUiConfig {
  return {
    signInPath: config.signInPath ?? DEFAULT_SAAS_UI_CONFIG.signInPath,
    signUpPath: config.signUpPath ?? DEFAULT_SAAS_UI_CONFIG.signUpPath,
    onboardingPath: config.onboardingPath ?? DEFAULT_SAAS_UI_CONFIG.onboardingPath,
    homePath: config.homePath ?? DEFAULT_SAAS_UI_CONFIG.homePath,
    inboxPath: config.inboxPath ?? DEFAULT_SAAS_UI_CONFIG.inboxPath,
    lazy: config.lazy ?? DEFAULT_SAAS_UI_CONFIG.lazy,
  };
}
