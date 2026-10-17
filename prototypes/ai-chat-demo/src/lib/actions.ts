import { navigate, runService } from '@protoyard/renderer-svelte';
import type { Agent, Conversation } from '../database/schema.ts';
import type { ChatServices } from '../domain/services.ts';

/** "Ask Atlas" quick start: a real direct conversation with one agent. */
export async function startWithAgent(services: ChatServices, agent: Agent): Promise<boolean> {
  const result = await runService<Conversation>(
    () => services.createConversation({ title: `Ask ${agent.name}`, agentIds: [agent.id] }),
    { errorTitle: `Could not start a chat with ${agent.name}` }
  );
  if (result.ok) navigate(`/c/${result.value.id}`);
  return result.ok;
}

/** Prompts offered in an empty conversation; each maps to a scripted topic. */
export const STARTER_PROMPTS = [
  'Summarize where the launch plan stands',
  'Compare option A vs option B for pricing',
  'Draft release notes for the search update',
  'What is the status of webhooks?',
];
