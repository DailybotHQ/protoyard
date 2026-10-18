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
