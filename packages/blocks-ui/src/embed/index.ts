/**
 * `@protoyard/blocks-ui/embed` — embed-app: framed preview with a start button.
 * `host.mountEmbed(target, app)` runs only after the click (KINDS supplies the
 * host and validates with loadUntrustedBlueprint). No app code loads before then.
 */
export { default as BlockFamilyRenderer } from './BlockFamilyRenderer.svelte';
export { default as EmbedApp } from './EmbedApp.svelte';
