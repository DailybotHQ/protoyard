import { parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { ChatDatabase, Message } from '../src/database/schema.ts';
import { SUPPORT_THREAD_ID } from '../src/database/schema.ts';
import { ASSISTANT, chunkReply, GREETING, scriptedReply } from '../src/domain/assistant.ts';
import { ChatValidationError, createChatServices } from '../src/domain/chat.ts';
import { authorOf } from '../src/lib/context.ts';
import { definition } from '../src/prototype.ts';
import { generateChatWorld } from '../src/scenarios/generators.ts';

const SCENARIOS = ['first-visit', 'returning-visitor', 'agent-offline', 'outage'];
const scenario = (id: string) => {
  const input = definition.scenarios.find((s) => s.id === id);
  if (!input) throw new Error(`missing scenario ${id}`);
  return parseScenario(input);
};

describe('chat-widget generator', () => {
  it('is deterministic and keeps referential integrity in every scenario', () => {
    for (const id of SCENARIOS) {
      const s = scenario(id);
      const a = generateChatWorld(createGenerateContext(s));
      expect(generateChatWorld(createGenerateContext(s)), id).toEqual(a);
      expect(
        validateWorld(a, { ...definition.integrity, referenceTime: s.referenceTime }),
        id
      ).toEqual([]);
      const conversations = a.tables.conversations ?? [];
      expect(conversations).toHaveLength(1);
      expect(conversations[0]?.id).toBe(SUPPORT_THREAD_ID);
      const messages = (a.tables.messages ?? []) as unknown as Message[];
      for (const m of messages)
        expect(Date.parse(m.at)).toBeLessThanOrEqual(Date.parse(s.referenceTime));
    }
    const first = generateChatWorld(createGenerateContext(scenario('first-visit')));
    expect(
      (first.tables.messages ?? []).filter((m) => (m as Message).authorKind === 'person')
    ).toHaveLength(0);
    expect((first.tables.messages as Message[])[0]?.body).toBe(GREETING);

    const returning = generateChatWorld(createGenerateContext(scenario('returning-visitor')));
    expect((returning.tables.messages as Message[]).length).toBeGreaterThan(3);
  });

  it('scripts deterministic replies and lossless chunks', () => {
    const text = scriptedReply('please help with shipping');
    expect(scriptedReply('please help with shipping')).toBe(text);
    expect(chunkReply(text).join('')).toBe(text);
    expect(chunkReply(text).length).toBeGreaterThan(3);
  });
});

describe('chat-widget services on the real runtime', () => {
  let harness = createHarness<ChatDatabase>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<ChatDatabase>(definition);
  });

  it('persists a message, streams the assistant reply, and both survive reload', async () => {
    let runtime = await harness.boot('first-visit');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    await chat.ensureSupportThread();

    let chunks = 0;
    runtime.db.messages.hook('updating', (mods) => {
      if ('body' in (mods as object)) chunks++;
    });
    const { message, reply } = await chat.send(SUPPORT_THREAD_ID, 'Where is my order?');
    const answered = await reply;
    expect(answered.status).toBe('sent');
    expect(chunks).toBeGreaterThan(1);

    runtime = await harness.reload(runtime);
    const stored = await runtime.db.messages
      .where('[conversationId+at]')
      .between([SUPPORT_THREAD_ID, ''], [SUPPORT_THREAD_ID, '￿'])
      .toArray();
    expect(stored.some((m) => m.id === message.id)).toBe(true);
    const assistant = stored.find((m) => m.promptId === message.id);
    expect(assistant).toMatchObject({
      authorId: ASSISTANT.id,
      body: scriptedReply('Where is my order?'),
      status: 'sent',
    });
  });

  it('requests a human handoff and joins a support agent message', async () => {
    const runtime = await harness.boot('first-visit');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    await chat.ensureSupportThread();
    const updated = await chat.requestHandoff(SUPPORT_THREAD_ID);
    expect(updated.handoffRequested).toBe(true);
    expect(updated.handoffJoined).toBe(true);
    const messages = await runtime.db.messages
      .where('[conversationId+at]')
      .between([SUPPORT_THREAD_ID, ''], [SUPPORT_THREAD_ID, '￿'])
      .toArray();
    expect(messages.some((m) => m.authorId === 'user_agent' && /Casey/.test(m.body))).toBe(true);
  });

  it('fails assistant replies during an outage and recovers on retry', async () => {
    const runtime = await harness.boot('outage');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const { message, reply } = await chat.send(SUPPORT_THREAD_ID, 'any ideas?');
    expect(await runtime.db.messages.get(message.id)).toBeDefined();
    const failed = await reply;
    expect(failed.status).toBe('failed');
    expect(failed.error).toMatch(/simulated/i);

    await runtime.overrides.set({ environment: { failureMode: 'none' } });
    const retried = await chat.retry(failed.id);
    expect(retried?.status).toBe('sent');
    expect(await runtime.db.messages.get(failed.id)).toBeUndefined();
  });

  it('rejects empty messages', async () => {
    const runtime = await harness.boot('first-visit');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    await chat.ensureSupportThread();
    await expect(chat.send(SUPPORT_THREAD_ID, '   ')).rejects.toBeInstanceOf(ChatValidationError);
  });

  it('boots returning-visitor with prior history', async () => {
    const runtime = await harness.boot('returning-visitor');
    expect(runtime.session.principal()?.persona.id).toBe('user_visitor');
    const count = await runtime.db.messages
      .where('conversationId')
      .equals(SUPPORT_THREAD_ID)
      .count();
    expect(count).toBeGreaterThan(3);
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
