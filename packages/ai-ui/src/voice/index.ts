/**
 * Lazy voice UI for simulated assistants.
 * Prefer `await import('@protoyard/ai-ui/voice')` so the orb and panel stay out
 * of the initial assistant chunk until voice mode is opened.
 */
export { default as VoiceOrb } from './VoiceOrb.svelte';
export { default as VoicePanel } from './VoicePanel.svelte';
