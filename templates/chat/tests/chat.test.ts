import { PermissionDeniedError, parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { ChatDatabase, Message } from '../src/database/schema.ts';
import { ASSISTANT, chunkReply, scriptedReply } from '../src/domain/assistant.ts';
import { ChatValidationError, createChatServices } from '../src/domain/chat.ts';
import { authorOf } from '../src/lib/context.ts';
import { definition } from '../src/prototype.ts';
import { generateChatWorld } from '../src/scenarios/generators.ts';

const SCENARIOS = ['empty', 'active', 'viewer', 'assistant-outage'];
const scenario = (id: string) => {
  const input = definition.scenarios.find((s) => s.id === id);
  if (!input) throw new Error(`missing scenario ${id}`);
  return parseScenario(input);
};

describe('generator', () => {
  it('is deterministic and keeps referential integrity in every scenario', () => {
    for (const id of SCENARIOS) {
      const s = scenario(id);
      const a = generateChatWorld(createGenerateContext(s));
      expect(generateChatWorld(createGenerateContext(s)), id).toEqual(a);
      expect(
        validateWorld(a, { ...definition.integrity, referenceTime: s.referenceTime }),
        id
      ).toEqual([]);
      // Messages never sit after the reference time and stay in order per conversation.
      const messages = (a.tables.messages ?? []) as unknown as Message[];
      for (const m of messages)
        expect(Date.parse(m.at)).toBeLessThanOrEqual(Date.parse(s.referenceTime));
    }
    expect(
      generateChatWorld(createGenerateContext(scenario('empty'))).tables.conversations
    ).toHaveLength(0);
    expect(
      generateChatWorld(createGenerateContext(scenario('active'))).tables.conversations
    ).toHaveLength(5);
  });

  it('scripts deterministic replies and lossless chunks', () => {
    const text = scriptedReply('please summarize');
    expect(scriptedReply('please summarize')).toBe(text);
    expect(chunkReply(text).join('')).toBe(text);
    expect(chunkReply(text).length).toBeGreaterThan(3);
  });
});

describe('chat services on the real runtime', () => {
  let harness = createHarness<ChatDatabase>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<ChatDatabase>(definition);
  });

  it('persists a message, streams the assistant reply, and both survive reload', async () => {
    let runtime = await harness.boot('empty');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const conversation = await chat.createConversation({ title: 'Planning' });

    let chunks = 0;
    runtime.db.messages.hook('updating', (mods) => {
      if ('body' in (mods as object)) chunks++;
    });
    const { message, reply } = await chat.send(conversation.id, 'Can you summarize?');
    const answered = await reply;
    expect(answered.status).toBe('sent');
    expect(chunks).toBeGreaterThan(1);

    runtime = await harness.reload(runtime);
    const stored = await runtime.db.messages
      .where('[conversationId+at]')
      .between([conversation.id, ''], [conversation.id, '￿'])
      .toArray();
    expect(stored.map((m) => m.id)[0]).toBe(message.id);
    expect(stored[1]).toMatchObject({
      authorId: ASSISTANT.id,
      body: scriptedReply('Can you summarize?'),
      status: 'sent',
      promptId: message.id,
    });
  });

  it('tracks unread replies and clears them on markRead', async () => {
    const runtime = await harness.boot('empty');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const conversation = await chat.createConversation({ title: 'Unread' });
    await (await chat.send(conversation.id, 'hello')).reply;
    expect(await chat.unreadCount(conversation.id, 'user_0001')).toBe(1);
    await chat.markRead(conversation.id);
    expect(await chat.unreadCount(conversation.id, 'user_0001')).toBe(0);
  });

  it('fails assistant replies during an outage and recovers on retry', async () => {
    const runtime = await harness.boot('assistant-outage');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const [conversation] = await runtime.db.conversations.toArray();
    const { message, reply } = await chat.send(conversation!.id, 'any ideas?');
    expect(await runtime.db.messages.get(message.id)).toBeDefined();
    const failed = await reply;
    expect(failed.status).toBe('failed');
    expect(failed.error).toMatch(/simulated/i);

    await runtime.overrides.set({ environment: { failureMode: 'none' } });
    const retried = await chat.retry(failed.id);
    expect(retried?.status).toBe('sent');
    expect(await runtime.db.messages.get(failed.id)).toBeUndefined();
  });

  it('stops a streaming reply, keeping what arrived', async () => {
    const runtime = await harness.boot('empty');
    let chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const conversation = await chat.createConversation({ title: 'Stop' });
    let replyId = '';
    chat = createChatServices(runtime, {
      sleep: async () => {
        if (replyId) await chat.cancel(replyId);
      },
    });
    runtime.db.messages.hook('creating', (_key, obj) => {
      if (obj.authorKind === 'assistant') replyId = obj.id;
    });
    const stopped = await (await chat.send(conversation.id, 'hello there')).reply;
    expect(stopped.status).toBe('stopped');
    expect(stopped.body.length).toBeGreaterThan(0);
    expect(stopped.body.length).toBeLessThan(scriptedReply('hello there').length);
  });

  it('blocks the viewer at service level and validates input', async () => {
    const runtime = await harness.boot('viewer');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const [conversation] = await runtime.db.conversations.toArray();
    await expect(chat.send(conversation!.id, 'hi')).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(chat.createConversation({ title: 'Nope' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );

    await runtime.session.switchActor('user_0002');
    await expect(chat.send(conversation!.id, '   ')).rejects.toBeInstanceOf(ChatValidationError);
    const notMine = (await runtime.db.conversations.toArray()).find(
      (c) => c.createdBy !== 'user_0002'
    );
    if (notMine)
      await expect(chat.remove(notMine.id)).rejects.toBeInstanceOf(PermissionDeniedError);
    const mine = await chat.createConversation({ title: 'Mine' });
    await expect(chat.remove(mine.id)).resolves.toBeUndefined();
  });
});

describe('authorOf faces', () => {
  const person = (id: string, avatar?: string) =>
    ({ id, name: `Person ${id}`, avatarColor: '#2563eb', ...(avatar ? { avatar } : {}) }) as never;

  it('resolves a persona avatar to the photo, and gives the assistant none', () => {
    const people = new Map([
      ['p1', person('p1', 'av-021')],
      ['p2', person('p2')],
      ['p3', person('p3', 'javascript:alert(1)')],
    ]);
    expect(authorOf(people, 'p1').image).toEqual({
      src: './avatars/64/av-021.webp',
      srcset: './avatars/64/av-021.webp 1x, ./avatars/128/av-021.webp 2x',
    });
    expect(authorOf(people, 'p2').image).toEqual({});
    expect(authorOf(people, 'p3').image).toEqual({});
    expect(authorOf(people, 'gone').image).toEqual({});
    expect(authorOf(people, ASSISTANT.id)).toMatchObject({ isAssistant: true, image: {} });
  });
});
