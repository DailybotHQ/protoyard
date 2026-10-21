/** Lazy conversational archetype entry: assistant and team-chat share the AI UI kit. */

export {
  type ConversationalAdapter,
  createConversationalAdapter,
  isConversationalArchetype,
} from './adapter.ts';
export { default as ConversationalApp } from './ConversationalApp.svelte';
export { scriptedReply } from './reply.ts';
