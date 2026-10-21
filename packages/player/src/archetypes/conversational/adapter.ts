import type { AssistantConversation, AssistantMessage } from '@protoyard/ai-ui';
import type { Blueprint, BlueprintArchetype } from '@protoyard/blueprint';
import type { Row } from '@protoyard/core';

type ConversationalArchetype = Extract<BlueprintArchetype, { id: 'assistant' | 'team-chat' }>;

export interface ConversationalAdapter {
  readonly id: ConversationalArchetype['id'];
  readonly path: string;
  readonly conversationEntity: string;
  readonly messageEntity: string;
  readonly memberEntity?: string;
  readonly parentProperty: 'conversationId' | 'roomId';
  readonly contentProperty: 'content' | 'body';
  conversations(rows: readonly Row[]): AssistantConversation[];
  messages(rows: readonly Row[], conversationId: string, actorId?: string): AssistantMessage[];
  messageInput(
    conversationId: string,
    content: string,
    now: string,
    role: 'user' | 'assistant',
    actorId?: string
  ): Record<string, unknown>;
  conversationInput(title: string): Record<string, unknown>;
}

function text(row: Row, property: string, fallback: string): string {
  const value = row[property];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function timestamp(row: Row): string {
  return text(row, 'updatedAt', text(row, 'createdAt', '1970-01-01T00:00:00.000Z'));
}

function idOf(row: Row): string {
  return String(row.id);
}

export function isConversationalArchetype(
  blueprint: Blueprint
): blueprint is Blueprint & { archetype: ConversationalArchetype } {
  const id = blueprint.archetype?.id;
  return id === 'assistant' || id === 'team-chat';
}

export function createConversationalAdapter(blueprint: Blueprint): ConversationalAdapter {
  if (!isConversationalArchetype(blueprint)) {
    throw new Error('The player conversational adapter needs an assistant or team-chat archetype.');
  }
  const archetype = blueprint.archetype;
  const teamChat = archetype.id === 'team-chat';
  const conversationEntity = teamChat ? archetype.entities.rooms : archetype.entities.conversations;
  const messageEntity = archetype.entities.messages;
  const memberEntity = teamChat ? archetype.entities.members : undefined;
  const parentProperty = teamChat ? 'roomId' : 'conversationId';
  const contentProperty = teamChat ? 'body' : 'content';

  return {
    id: archetype.id,
    path: archetype.screens[0].path,
    conversationEntity,
    messageEntity,
    memberEntity,
    parentProperty,
    contentProperty,
    conversations(rows) {
      return rows.map((row) => ({
        id: idOf(row),
        title: text(row, teamChat ? 'name' : 'title', 'New conversation'),
        updatedAt: timestamp(row),
        ...(typeof row.pinned === 'boolean' ? { pinned: row.pinned } : {}),
        ...(typeof row.folder === 'string' ? { folder: row.folder } : {}),
      }));
    },
    messages(rows, conversationId, actorId) {
      return rows
        .filter((row) => String(row[parentProperty]) === conversationId)
        .map((row) => ({
          id: idOf(row),
          role:
            teamChat && actorId
              ? String(row.authorId) === actorId
                ? 'user'
                : 'assistant'
              : row.role === 'user'
                ? 'user'
                : 'assistant',
          content: text(row, contentProperty, ''),
          createdAt: text(row, 'sentAt', timestamp(row)),
        }));
    },
    messageInput(conversationId, content, now, role, actorId) {
      if (teamChat) {
        return {
          body: content,
          roomId: conversationId,
          sentAt: now,
          ...(actorId && role === 'user' ? { authorId: actorId } : {}),
        };
      }
      return { content, role, conversationId, sentAt: now };
    },
    conversationInput(title) {
      return teamChat ? { name: title, visibility: 'public' } : { title, status: 'active' };
    },
  };
}
