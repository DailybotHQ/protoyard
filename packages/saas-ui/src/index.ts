export { default as AccountGate } from './account-gate/AccountGate.svelte';
export type {
  AccountGateController,
  AccountGateRequest,
} from './account-gate/account-gate.svelte.ts';
export { default as InboxBadge } from './components/InboxBadge.svelte';
export { default as SsoButtons } from './components/SsoButtons.svelte';
export { default as TrialBanner } from './components/TrialBanner.svelte';
export { default as WorkspaceSwitcher } from './components/WorkspaceSwitcher.svelte';
export {
  DEFAULT_SAAS_UI_CONFIG,
  type ResolvedSaasUiConfig,
  resolveSaasUiConfig,
  type SaasPendingAccount,
  type SaasUiConfig,
} from './config.ts';
export {
  getSaas,
  hasSaas,
  type ProvideSaasOptions,
  type ProvideSaasPortsOptions,
  provideSaas,
  type SaasContext,
} from './context.ts';
export {
  type GuardPathOptions,
  type GuardPrincipal,
  requireAuth,
  requireCapability,
  requireGuest,
  requireOnboarded,
  type SaasSessionLike,
} from './guards.ts';
export { daysUntil, formatCents } from './lib/money.ts';
export {
  type BillingPort,
  type OAuthPort,
  type SaasPorts,
  type SaasPortsFromRuntimeOptions,
  type SessionPort,
  type SessionPrincipal,
  saasPortsFromRuntime,
  sessionPortFromRuntime,
  type WorkspaceEntry,
  type WorkspacesPort,
} from './ports.ts';
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
export { default as Settings } from './screens/settings/Settings.svelte';
