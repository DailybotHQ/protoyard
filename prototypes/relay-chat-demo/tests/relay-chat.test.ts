import { parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { TeamChatDatabase } from '../src/database/schema.ts';
import { botReply, matchBot, summarizeChannel } from '../src/domain/bots.ts';
import { createTeamChatServices } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';
import { generateTeamChatWorld } from '../src/scenarios/generators.ts';

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
  });
});
