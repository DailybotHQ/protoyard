import { PermissionDeniedError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { ChatDatabase } from '../src/database/schema.ts';
import { scriptedReply } from '../src/domain/agents.ts';
import { createChatServices } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';

let harness = createHarness<ChatDatabase>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<ChatDatabase>(definition);
});

describe('ai-chat-demo on the real runtime', () => {
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

  it('marks agent replies failed during an outage and recovers on retry', async () => {
    const runtime = await harness.boot('agent-outage');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const conversation = await chat.createConversation({ title: 'Ops', agentIds: ['agent_ops'] });
    const { runs } = await chat.send(conversation.id, 'status of webhooks?');
    const [run] = await runs;
    expect(run?.status).toBe('error');
    expect((await runtime.db.messages.where('runId').equals(run!.id).first())?.status).toBe(
      'failed'
    );

    await runtime.overrides.set({ environment: { failureMode: 'none' } });
    const retried = await chat.retry(run!.id);
    expect(retried?.status).toBe('done');
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

describe('ai-chat-demo review regressions', () => {
  it('rejects sends and retries on archived conversations at the service level', async () => {
    const runtime = await harness.boot('agent-outage');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const conversation = await chat.createConversation({ title: 'Ops', agentIds: ['agent_ops'] });
    const { runs } = await chat.send(conversation.id, 'status?');
    const [run] = await runs;
    await chat.archive(conversation.id);
    await expect(chat.send(conversation.id, 'hello')).rejects.toThrow(/archived/);
    await expect(chat.retry(run!.id)).rejects.toThrow(/archived/);
  });

  it('pinning goes through the simulated network', async () => {
    const runtime = await harness.boot('active-team');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const conversation = (await runtime.db.conversations.toArray())[0]!;
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(chat.togglePin(conversation.id)).rejects.toMatchObject({ code: 'offline' });
    expect((await runtime.db.conversations.get(conversation.id))?.pinned).toBe(conversation.pinned);
  });

  it('does not stamp new messages in the future after advance + reset', async () => {
    const runtime = await harness.boot('active-team');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const conversation = (await runtime.db.conversations.toArray())[0]!;
    await runtime.scenarios.advance({ days: 7 });
    await chat.send(conversation.id, 'after advance');
    await runtime.scenarios.reset();
    const { message } = await chat.send(conversation.id, 'after reset');
    const latestSeeded = Math.max(
      ...(await runtime.db.messages.where('conversationId').equals(conversation.id).toArray())
        .filter((m) => m.id !== message.id)
        .map((m) => Date.parse(m.at))
    );
    expect(Date.parse(message.at) - Math.max(latestSeeded, runtime.clock.nowMs())).toBeLessThan(
      1000
    );
  });
});

describe('ai-chat-demo delta-review regressions', () => {
  it('two concurrent pin toggles end where they started (no lost update)', async () => {
    const runtime = await harness.boot('active-team');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const conversation = (await runtime.db.conversations.toArray())[0]!;
    await Promise.all([chat.togglePin(conversation.id), chat.togglePin(conversation.id)]);
    expect((await runtime.db.conversations.get(conversation.id))?.pinned).toBe(conversation.pinned);
  });

  it('retry offline keeps the failed reply instead of deleting it', async () => {
    const runtime = await harness.boot('agent-outage');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const conversation = await chat.createConversation({ title: 'Ops', agentIds: ['agent_ops'] });
    const { runs } = await chat.send(conversation.id, 'status?');
    const [run] = await runs;
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(chat.retry(run!.id)).rejects.toMatchObject({ code: 'offline' });
    expect(await runtime.db.messages.where('runId').equals(run!.id).count()).toBe(1);
  });
});
