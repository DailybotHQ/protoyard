/**
 * `@protoyard/decks-ui/presenter` — presenter window over BroadcastChannel,
 * with an in-page split fallback when popups are blocked (ADR-038).
 */
export { type OpenPresenterOptions, openPresenter, type PresenterOpenResult } from './open.ts';
export { default as PresenterHost } from './PresenterHost.svelte';
export { default as PresenterView } from './PresenterView.svelte';
