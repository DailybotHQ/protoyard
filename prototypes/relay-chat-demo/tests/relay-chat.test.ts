import { PermissionDeniedError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { expectBootableWorld } from '../../../tests/support/smoke.ts';
import type { TeamChatDatabase } from '../src/database/schema.ts';
import { createTeamChatServices, TeamChatValidationError } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';

describe('relay services', () => {
  let harness = createHarness<TeamChatDatabase>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<TeamChatDatabase>(definition);
  });

  it('generates deterministic worlds and boots the default scenario', async () => {
    await expectBootableWorld(definition, harness);
  });

  it('posts, reacts, threads, summarizes and starts a huddle', async () => {
    const runtime = await harness.boot('busy-day');
    const chat = createTeamChatServices(runtime);
    const [ws] = await chat.listWorkspaces();
    const channels = await chat.listChannels(ws!.id);
    const general = channels.find((c) => c.name === 'general')!;

    const { message } = await chat.sendMessage(general.id, { body: 'Ship the demo path first.' });
    await chat.toggleReaction(message.id, '👍');

    const thread = await chat.sendMessage(general.id, {
      body: 'Agree — keep the checklist tight.',
      threadId: message.id,
    });
    expect(thread.message.threadId).toBe(message.id);

    const ai = await chat.sendMessage(general.id, { body: '@relay what should we prioritize?' });
    expect(ai.bot?.authorId).toBe('bot_relay');
    expect(ai.bot?.body.length).toBeGreaterThan(10);
    expect(ai.bot?.threadId).toBeNull();
    const channelAfterAi = await chat.listMessages(general.id, null);
    expect(channelAfterAi.some((m) => m.id === ai.bot!.id)).toBe(true);

    const summary = await chat.sendMessage(general.id, { body: '/summarize' });
    expect(summary.bot?.body).toMatch(/Relay summary \(simulated\)/i);
    expect(summary.bot?.threadId).toBeNull();
    const channelAfterSummary = await chat.listMessages(general.id, null);
    expect(channelAfterSummary.some((m) => m.id === summary.bot!.id)).toBe(true);

    const huddle = await chat.startHuddle(general.id);
    expect(huddle.endedAt).toBeNull();
    const voice = chat.createHuddleVoice(huddle.id);
    voice.start('push-to-talk');
    await voice.finishListening();
    voice.stop();
    await chat.endHuddle(huddle.id);

    const summaries = await chat.listReactionSummaries(general.id);
    expect(
      summaries.some((s) => s.messageId === message.id && s.emoji === '👍' && s.count >= 1)
    ).toBe(true);
  });

  it('hides private channel and DM messages from non-members in list and search', async () => {
    const runtime = await harness.boot('busy-day');
    const chat = createTeamChatServices(runtime);
    const [ws] = await chat.listWorkspaces();
    const privateCh = await chat.createChannel(ws!.id, {
      name: 'exec-only',
      kind: 'private',
    });
    await chat.sendMessage(privateCh.id, { body: 'secret roadmap' });

    const people = (await runtime.db.table('py_personas').toArray()) as Array<{
      id: string;
    }>;
    const outsider = people.find((p) => p.id !== runtime.session.principal()!.persona.id);
    expect(outsider).toBeTruthy();
    await runtime.session.signIn(outsider!.id);

    const outsiderChat = createTeamChatServices(runtime);
    await expect(outsiderChat.listMessages(privateCh.id)).rejects.toBeInstanceOf(
      TeamChatValidationError
    );
    const hits = await outsiderChat.search(ws!.id, 'secret roadmap');
    expect(hits.some((m) => m.body.includes('secret roadmap'))).toBe(false);
  });

  it('denies a viewer from posting with PermissionDeniedError', async () => {
    const runtime = await harness.boot('viewer');
    const chat = createTeamChatServices(runtime);
    expect(chat.can('message:create')).toBe(false);
    const [ws] = await chat.listWorkspaces();
    const channels = await chat.listChannels(ws!.id);
    await expect(chat.sendMessage(channels[0]!.id, { body: 'Nope' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
  });
});
