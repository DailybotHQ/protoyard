import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime, type LiveQuery, liveQuery } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type {
  AssistantDatabase,
  Conversation,
  Message,
  Project,
  WorkspaceSettings,
} from '../database/schema.ts';
import { type AssistantServices, createAssistantServices } from '../domain/services.ts';

const KEY = Symbol('ai-assistant-template');

export interface AssistantContext {
  runtime: PrototypeRuntime<AssistantDatabase>;
  db: AssistantDatabase;
  services: AssistantServices;
  projects: LiveQuery<Project[]>;
  conversations: LiveQuery<Conversation[]>;
  messages: LiveQuery<Message[]>;
  settings: LiveQuery<WorkspaceSettings | undefined>;
}

export function provideAssistant(runtime?: PrototypeRuntime<AssistantDatabase>): AssistantContext {
  const activeRuntime = runtime ?? getRuntime<AssistantDatabase>();
  const { db } = activeRuntime;
  const services = createAssistantServices(activeRuntime);
  const projects = liveQuery(() => db.projects.orderBy('createdAt').toArray(), { initial: [] });
  const conversations = liveQuery(() => db.conversations.orderBy('updatedAt').reverse().toArray(), {
    initial: [],
  });
  const messages = liveQuery(() => db.messages.orderBy('createdAt').toArray(), { initial: [] });
  const settings = liveQuery(() => db.settings.get('workspace'), { initial: undefined });
  const context: AssistantContext = {
    runtime: activeRuntime,
    db,
    services,
    projects,
    conversations,
    messages,
    settings,
  };
  setContext(KEY, context);
  return context;
}

export function useAssistant(): AssistantContext {
  const context = getContext<AssistantContext | undefined>(KEY);
  if (!context) throw new Error('useAssistant() must be used inside App.svelte');
  return context;
}
