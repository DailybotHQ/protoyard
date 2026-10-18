import type { AssistantCanvas, AssistantConversation, AssistantMessage } from '@protoyard/ai-ui';
import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

export type Project = { id: string; name: string; color: string; createdAt: string };
export type Conversation = AssistantConversation & { projectId: string; modelId: string };
export type Message = AssistantMessage & { conversationId: string; attachments?: string[] };
export type WorkspaceSettings = {
  id: 'workspace';
  customInstructions: string;
  memory: string;
  memoryEnabled: boolean;
  dataControls: 'standard' | 'private';
  monthlyLimit: number;
  maxRequestsPerMinute: number;
  agentApprovalRequired: boolean;
  canvas: AssistantCanvas | null;
  folders: string[];
  updatedAt: string;
};

export type AssistantDatabase = Dexie & {
  projects: EntityTable<Project, 'id'>;
  conversations: EntityTable<Conversation, 'id'>;
  messages: EntityTable<Message, 'id'>;
  settings: EntityTable<WorkspaceSettings, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        projects: 'id, createdAt',
        conversations: 'id, projectId, updatedAt, pinned, folder',
        messages: 'id, conversationId, createdAt, role',
        settings: 'id',
      },
    },
  ],
};
