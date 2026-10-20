// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Blueprint, parseBlueprint } from '@protoyard/blueprint';
import { describe, expect, it } from 'vitest';
import {
  createConversationalAdapter,
  isConversationalArchetype,
} from '../src/archetypes/conversational/adapter.ts';

const NOW = '2026-01-02T03:04:05.000Z';

function blueprintFor(id: 'assistant' | 'team-chat'): Blueprint {
  const entities =
    id === 'assistant'
      ? [
          {
            name: 'conversation',
            plural: 'conversations',
            titleField: 'title',
            fields: [
              { name: 'title', kind: 'text', required: true },
              { name: 'status', kind: 'enum', values: ['active'], default: 'active' },
              { name: 'owner', kind: 'persona' },
            ],
          },
          {
            name: 'message',
            plural: 'messages',
            titleField: 'label',
            fields: [
              { name: 'label', kind: 'text', required: true },
              { name: 'content', kind: 'longText', required: true },
              { name: 'role', kind: 'enum', values: ['user', 'assistant', 'tool'] },
              { name: 'conversation', kind: 'relation', to: 'conversation', onDelete: 'cascade' },
              { name: 'sentAt', kind: 'datetime' },
            ],
          },
        ]
      : [
          {
            name: 'room',
            plural: 'rooms',
            titleField: 'name',
            fields: [
              { name: 'name', kind: 'text', required: true },
              {
                name: 'visibility',
                kind: 'enum',
                values: ['public', 'private'],
                default: 'public',
              },
            ],
          },
          {
            name: 'message',
            plural: 'messages',
            titleField: 'label',
            fields: [
              { name: 'label', kind: 'text', required: true },
              { name: 'body', kind: 'longText', required: true },
              { name: 'room', kind: 'relation', to: 'room', onDelete: 'cascade' },
              { name: 'author', kind: 'relation', to: 'team-member' },
              { name: 'sentAt', kind: 'datetime' },
            ],
          },
          {
            name: 'team-member',
            plural: 'team-members',
            titleField: 'name',
            fields: [{ name: 'name', kind: 'text', required: true }],
          },
        ];
  return parseBlueprint({
    formatVersion: 1,
    name: `${id} fixture`,
    entities,
    roles: [{ name: 'member', permissions: { '*': ['*'] } }],
    screens: [],
    archetype:
      id === 'assistant'
        ? {
            id,
            kits: ['@protoyard/ai', '@protoyard/ai-ui'],
            entities: { conversations: 'conversation', messages: 'message' },
            screens: [{ kind: 'assistant-workspace', path: '/assistant' }],
          }
        : {
            id,
            kits: ['@protoyard/ai', '@protoyard/ai-ui'],
            entities: { rooms: 'room', messages: 'message', members: 'team-member' },
            screens: [{ kind: 'team-chat', path: '/team-chat' }],
          },
  });
}

describe('player conversational archetypes', () => {
  it('maps assistant rows to the AI UI contract and persists relation inputs', () => {
    const blueprint = blueprintFor('assistant');
    expect(isConversationalArchetype(blueprint)).toBe(true);
    const adapter = createConversationalAdapter(blueprint);
    expect(adapter.path).toBe('/assistant');
    expect(adapter.conversations([{ id: 'c1', title: 'Launch plan', updatedAt: NOW }])).toEqual([
      { id: 'c1', title: 'Launch plan', updatedAt: NOW },
    ]);
    expect(
      adapter.messages(
        [{ id: 'm1', conversationId: 'c1', content: 'Hello', role: 'user', sentAt: NOW }],
        'c1'
      )
    ).toEqual([{ id: 'm1', role: 'user', content: 'Hello', createdAt: NOW }]);
    expect(adapter.messageInput('c1', 'Hello', NOW, 'user')).toEqual({
      content: 'Hello',
      role: 'user',
      conversationId: 'c1',
      sentAt: NOW,
    });
  });

  it('adapts team-chat rooms through the same lazy assistant workspace entry', () => {
    const blueprint = blueprintFor('team-chat');
    const adapter = createConversationalAdapter(blueprint);
    expect(adapter.path).toBe('/team-chat');
    expect(adapter.conversationEntity).toBe('room');
    expect(adapter.memberEntity).toBe('team-member');
    expect(adapter.conversations([{ id: 'r1', name: 'Design', updatedAt: NOW }])).toEqual([
      { id: 'r1', title: 'Design', updatedAt: NOW },
    ]);
    expect(
      adapter.messages(
        [{ id: 'm1', roomId: 'r1', body: 'Ship it', authorId: 'p1', sentAt: NOW }],
        'r1',
        'p1'
      )
    ).toEqual([{ id: 'm1', role: 'user', content: 'Ship it', createdAt: NOW }]);
    expect(adapter.messageInput('r1', 'Ship it', NOW, 'user', 'p1')).toEqual({
      body: 'Ship it',
      roomId: 'r1',
      sentAt: NOW,
      authorId: 'p1',
    });
  });

  it('keeps conversational kits behind a blueprint-gated lazy player entry', () => {
    const player = readFileSync(resolve(import.meta.dirname, '../src/PlayerApp.svelte'), 'utf8');
    const entry = readFileSync(
      resolve(import.meta.dirname, '../src/archetypes/conversational/index.ts'),
      'utf8'
    );
    const app = readFileSync(
      resolve(import.meta.dirname, '../src/archetypes/conversational/ConversationalApp.svelte'),
      'utf8'
    );
    expect(player).toContain("import('./archetypes/conversational/index.ts')");
    expect(player).toContain("archetype === 'assistant' || archetype === 'team-chat'");
    expect(entry).toContain('./ConversationalApp.svelte');
    expect(app).toContain("import('@protoyard/ai-ui')");
    expect(app).not.toContain("import { AssistantWorkspace } from '@protoyard/ai-ui'");
  });
});
