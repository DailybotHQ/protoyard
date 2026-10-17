import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { ChatDatabase } from '../src/database/schema.ts';
import { createChatServices } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';

let harness = createHarness<ChatDatabase>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<ChatDatabase>(definition);
});

describe('read state and run lifecycle (UI contracts)', () => {
  it('markRead clears agent replies stamped ahead of the frozen clock', async () => {
    const runtime = await harness.boot('empty-new-user');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const conversation = await chat.createConversation({
      title: 'Ask Atlas',
      agentIds: ['agent_atlas'],
    });
    const { runs } = await chat.send(conversation.id, 'summarize please');
    await runs;
    expect(await chat.unreadCount(conversation.id, 'user_0001')).toBe(1);
    await chat.markRead(conversation.id);
    expect(await chat.unreadCount(conversation.id, 'user_0001')).toBe(0);
  });

  it('gives concurrent agent replies distinct, ordered timestamps', async () => {
    const runtime = await harness.boot('empty-new-user');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const conversation = await chat.createConversation({
      title: 'Both',
      agentIds: ['agent_atlas', 'agent_quill'],
    });
    const { runs } = await chat.send(conversation.id, '@atlas @quill hello');
    await runs;
    const messages = await runtime.db.messages
      .where('conversationId')
      .equals(conversation.id)
      .toArray();
    expect(new Set(messages.map((m) => m.at)).size).toBe(3);
  });

  it('reports live runs and closes runs orphaned by a reload', async () => {
    const runtime = await harness.boot('empty-new-user');
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chat = createChatServices(runtime, { chunkDelayMs: 1, sleep: () => gate });
    const conversation = await chat.createConversation({
      title: 'Ask Atlas',
      agentIds: ['agent_atlas'],
    });
    const { runs } = await chat.send(conversation.id, 'summarize please');
    let run = await runtime.db.runs.where('conversationId').equals(conversation.id).first();
    for (let i = 0; i < 20 && !run; i++) {
      await new Promise((r) => setTimeout(r, 5));
      run = await runtime.db.runs.where('conversationId').equals(conversation.id).first();
    }
    expect(run?.status).toBe('streaming');
    expect(chat.isLive(run!.id)).toBe(true);

    // A fresh services instance (a reloaded page) does not own the stream.
    const other = createChatServices(runtime, { chunkDelayMs: 0 });
    expect(other.isLive(run!.id)).toBe(false);
    await other.cancel(run!.id);
    expect((await runtime.db.runs.get(run!.id))?.status).toBe('cancelled');
    const reply = await runtime.db.messages.where('runId').equals(run!.id).first();
    expect(reply?.status).toBe('sent');

    release();
    await runs;
    expect(chat.isLive(run!.id)).toBe(false);
  });
});
