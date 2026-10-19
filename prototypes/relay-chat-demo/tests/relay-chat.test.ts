import { PermissionDeniedError, parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { TeamChatDatabase } from '../src/database/schema.ts';
import { botReply, matchBot, summarizeChannel } from '../src/domain/bots.ts';
import { createTeamChatServices, TeamChatValidationError } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';
import { generateTeamChatWorld } from '../src/scenarios/generators.ts';
import { applyTeamChatEvent, teamChatTimeline } from '../src/scenarios/timeline.ts';

const scenario = (id: string) => {
  const input = definition.scenarios.find((s) => s.id === id);
  if (!input) throw new Error(`missing ${id}`);
  return parseScenario(input);
};

describe('relay-chat generator', () => {
  it('is deterministic and valid for busy-day', () => {
    const s = scenario('busy-day');
    const a = generateTeamChatWorld(createGenerateContext(s));
    expect(generateTeamChatWorld(createGenerateContext(s))).toEqual(a);
    expect(validateWorld(a, { ...definition.integrity, referenceTime: s.referenceTime })).toEqual(
      []
    );
    expect((a.tables.workspaces ?? [])[0]).toMatchObject({ name: 'Relay Labs HQ' });
  });
});

describe('relay bots', () => {
  it('matches @relay and /summarize and is deterministic', () => {
    expect(matchBot('@relay ship plan')?.handle).toBe('relay');
    expect(matchBot('/summarize')?.id).toBe('bot_relay');
    expect(botReply('bot_relay', 'hello', 42)).toBe(botReply('bot_relay', 'hello', 42));
    expect(summarizeChannel(['a', 'b'], 7)).toBe(summarizeChannel(['a', 'b'], 7));
    expect(summarizeChannel([], 1)).toMatch(/quiet/i);
  });
});

describe('relay services', () => {
  let harness = createHarness<TeamChatDatabase>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<TeamChatDatabase>(definition);
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

  it('refuses send without membership and allows join on public channels', async () => {
    const runtime = await harness.boot('empty');
    const chat = createTeamChatServices(runtime);
    const [ws] = await chat.listWorkspaces();
    const channel = await chat.createChannel(ws!.id, { name: 'announce', kind: 'public' });
    // Creator is a member. Remove membership to simulate a non-member reader.
    const me = runtime.session.principal()!.persona.id;
    await runtime.db.channelMembers.delete(`${channel.id}:${me}`);
    expect(await chat.isMember(channel.id)).toBe(false);
    await expect(chat.sendMessage(channel.id, { body: 'hello' })).rejects.toBeInstanceOf(
      TeamChatValidationError
    );
    await chat.joinChannel(channel.id);
    expect(await chat.isMember(channel.id)).toBe(true);
    const { message } = await chat.sendMessage(channel.id, { body: 'hello after join' });
    expect(message.body).toBe('hello after join');
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

  it('advance 7d once equals seven 1d advances (stable timeline ids)', async () => {
    const runtime = await harness.boot('busy-day');
    const from = new Date('2026-06-01T12:00:00.000Z');
    const read = (table: string) => runtime.db.table(table).toArray() as never;
    const base = createGenerateContext(scenario('busy-day'));
    const week = await teamChatTimeline({
      ...base,
      from,
      to: new Date(from.getTime() + 7 * 86_400_000),
      read,
    } as never);
    const dayEvents = [];
    for (let i = 0; i < 7; i++) {
      const start = new Date(from.getTime() + i * 86_400_000);
      const end = new Date(from.getTime() + (i + 1) * 86_400_000);
      dayEvents.push(...(await teamChatTimeline({ ...base, from: start, to: end, read } as never)));
    }
    expect(week.map((e) => e.id).sort()).toEqual(dayEvents.map((e) => e.id).sort());
    expect(week.length).toBeGreaterThan(0);
    const chatter = week.find((e) => e.type === 'message.incoming');
    if (chatter) {
      await applyTeamChatEvent(chatter, {
        put: async (table, row) => {
          await runtime.db.table(table).put(row);
        },
        get: async (table, id) => runtime.db.table(table).get(id),
        remove: async (table, id) => {
          await runtime.db.table(table).delete(id);
        },
      });
      expect(await runtime.db.messages.get(`msg_${chatter.id}`)).toMatchObject({
        id: `msg_${chatter.id}`,
      });
    }
  });
});
