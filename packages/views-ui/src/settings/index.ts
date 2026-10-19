/**
 * `@protoyard/views-ui/settings` — settings page patterns: a section layout
 * (side nav, list → detail on phones), sections, preference rows, a dirty
 * SaveBar that guards navigation, and a type-to-confirm DangerZone. Writes go
 * through the prototype's services (`runService`); nothing here touches data.
 */
export { default as DangerZone } from './DangerZone.svelte';
export { guardHashNavigation, type NavigationGuardOptions } from './guard.ts';
export { default as RadioRow } from './RadioRow.svelte';
export { default as SaveBar } from './SaveBar.svelte';
export { default as SelectRow } from './SelectRow.svelte';
export { default as SettingsLayout } from './SettingsLayout.svelte';
export { default as SettingsSection } from './SettingsSection.svelte';
export { default as SwitchRow } from './SwitchRow.svelte';
export type { FieldErrors, SettingsNavItem } from './types.ts';
