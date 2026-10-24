/**
 * `@protoyard/blocks-ui/embed` — Texuli embed family + host mountEmbed adapter.
 * Sandbox helpers: `createSandboxedEmbedIframe` / `createSandboxedEmbedMount`
 * from `@texuli/blocks/embed`.
 */

export {
  createSandboxedEmbedIframe,
  createSandboxedEmbedMount,
  EMBED_IFRAME_REFERRER_POLICY,
  EMBED_IFRAME_SANDBOX,
} from '@texuli/blocks/embed';
export { default as BlockFamilyRenderer } from './BlockFamilyRenderer.svelte';
export { default as EmbedApp } from './EmbedApp.svelte';
