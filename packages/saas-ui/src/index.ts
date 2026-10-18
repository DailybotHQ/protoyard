export { default as InboxBadge } from './components/InboxBadge.svelte';
export { default as WorkspaceSwitcher } from './components/WorkspaceSwitcher.svelte';
export {
  DEFAULT_SAAS_UI_CONFIG,
  type ResolvedSaasUiConfig,
  resolveSaasUiConfig,
  type SaasUiConfig,
} from './config.ts';
export {
  getSaas,
  hasSaas,
  provideSaas,
  type SaasContext,
} from './context.ts';
export {
  type GuardPathOptions,
  requireAuth,
  requireCapability,
  requireGuest,
  requireOnboarded,
  type SaasSessionLike,
} from './guards.ts';
export {
  requireSaasApp,
  resolveEagerSaasScreens,
  type SaasRouteGroup,
  type SaasRoutesOptions,
  saasRoutes,
} from './routes.ts';
export { default as InboxDrawer } from './screens/inbox/InboxDrawer.svelte';
export {
  default as OnboardingWizard,
  type OnboardingStepSnippet,
  type OnboardingStepSnippetArgs,
} from './screens/onboarding/OnboardingWizard.svelte';
export {
  defaultOnboardingSteps,
  type OnboardingField,
  type OnboardingRuntime,
  type OnboardingSelectOption,
  type OnboardingStepContext,
  type OnboardingUiStep,
  stepInput,
  stepValues,
} from './screens/onboarding/steps.ts';
