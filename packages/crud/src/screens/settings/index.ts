/**
 * `@protoyard/crud/screens/settings`: the generated settings route. A separate
 * entry so the screen and its services load only with the settings route.
 */
export { default as SettingsScreen } from './SettingsScreen.svelte';
export {
  type AppearanceInput,
  AppearanceInputSchema,
  createSettingsServices,
  type ProfileInput,
  ProfileInputSchema,
  type SettingsServices,
  WORKSPACE_CAPABILITY,
  type WorkspaceInput,
  WorkspaceInputSchema,
} from './services.ts';
export {
  type NotificationRuleSummary,
  notificationRulesFor,
  type SettingsSection,
  type ThemeChoice,
  themeChoices,
} from './settings.ts';
