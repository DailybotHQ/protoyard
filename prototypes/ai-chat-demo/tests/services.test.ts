import { PermissionDeniedError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { expectBootableWorld } from '../../../tests/support/smoke.ts';
import type { ChatDatabase } from '../src/database/schema.ts';
import { scriptedReply } from '../src/domain/agents.ts';
import { createChatServices } from '../src/domain/services.ts';
import { parseInline } from '../src/lib/markdown.ts';
import { definition } from '../src/prototype.ts';

let harness = createHarness<ChatDatabase>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<ChatDatabase>(definition);
});

describe('ai-chat-demo on the real runtime', () => {
  it('generates deterministic worlds and boots the default scenario', async () => {
    await expectBootableWorld(definition, harness);
  });

  it('persists a message and streams the scripted agent reply', async () => {
    let runtime = await harness.boot('empty-new-user');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const conversation = await chat.createConversation({
      title: 'Ask Atlas',
      agentIds: ['agent_atlas'],
    });
    const { message, runs } = await chat.send(conversation.id, 'Please summarize the launch plan');
    const [run] = await runs;
    expect(run?.status).toBe('done');

    runtime = await harness.reload(runtime);
    const messages = await runtime.db.messages
      .where('conversationId')
      .equals(conversation.id)
      .sortBy('at');
    expect(messages[0]?.id).toBe(message.id);
    const atlas = await runtime.db.agents.get('agent_atlas');
    expect(messages[1]?.body).toBe(scriptedReply(atlas!, 'Please summarize the launch plan'));
    expect(messages[1]?.status).toBe('sent');
  });

  it('guests can read but not post; members manage only their own conversations', async () => {
    const runtime = await harness.boot('active-team');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const conversations = await runtime.db.conversations.toArray();
    await runtime.session.switchActor('user_0004');
    await expect(chat.send(conversations[0]!.id, 'hello')).rejects.toBeInstanceOf(
      PermissionDeniedError
    );

    await runtime.session.switchActor('user_0002');
    const notMine = conversations.find((c) => c.createdBy !== 'user_0002');
    if (notMine)
      await expect(chat.archive(notMine.id)).rejects.toBeInstanceOf(PermissionDeniedError);
    const mine = await chat.createConversation({ title: 'Mine', agentIds: [] });
    await expect(chat.archive(mine.id)).resolves.toBeUndefined();
  });
});

describe('ai-chat-demo safe markdown', () => {
  it('keeps markup-looking text as plain text (never HTML)', () => {
    const nodes = parseInline('<img src=x onerror=alert(1)> **unclosed');
    expect(nodes).toEqual([{ type: 'text', text: '<img src=x onerror=alert(1)> **unclosed' }]);
  });
});
