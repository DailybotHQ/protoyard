import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { TeamChatDatabase } from '../src/database/schema.ts';
import { createTeamChatServices } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';

describe('team-chat message order while the clock is paused', () => {
  let harness = createHarness<TeamChatDatabase>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<TeamChatDatabase>(definition);
  });

  it('keeps insertion order for a burst of messages at the same simulated instant', async () => {
    const runtime = await harness.boot('empty');
    // Paused by default: every write would share clock.now() without nextMonotonicIso.
    expect(runtime.clock.getState().running).toBe(false);
    const frozen = runtime.clock.now().toISOString();

    const chat = createTeamChatServices(runtime);
    const [workspace] = await chat.listWorkspaces();
    const channels = await chat.listChannels(workspace!.id);
    const general = channels.find((c) => c.name === 'general');
    expect(general).toBeTruthy();

    const bodies = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
    const sentIds: string[] = [];
    for (const body of bodies) {
      const { message } = await chat.sendMessage(general!.id, { body });
      sentIds.push(message.id);
      expect(message.at >= frozen).toBe(true);
    }

    const listed = await chat.listMessages(general!.id, null);
    const channelMessages = listed.filter((m) => sentIds.includes(m.id));
    expect(channelMessages.map((m) => m.body)).toEqual(bodies);
    expect(channelMessages.map((m) => m.id)).toEqual(sentIds);

    const times = channelMessages.map((m) => m.at);
    expect(times).toEqual([...times].sort());
    expect(new Set(times).size).toBe(bodies.length);

    // sortBy('at') alone must match insertion order (no shuffle from random ids).
    const byAt = await runtime.db.messages.where('channelId').equals(general!.id).sortBy('at');
    expect(byAt.filter((m) => sentIds.includes(m.id)).map((m) => m.body)).toEqual(bodies);
  });

  it('orders a user message before its bot reply under a paused clock', async () => {
    const runtime = await harness.boot('empty');
    expect(runtime.clock.getState().running).toBe(false);

    const chat = createTeamChatServices(runtime);
    const [workspace] = await chat.listWorkspaces();
    const channels = await chat.listChannels(workspace!.id);
    const general = channels.find((c) => c.name === 'general');
    expect(general).toBeTruthy();

    const { message, bot } = await chat.sendMessage(general!.id, {
      body: '@standup shipping the demo',
    });
    expect(bot).toBeTruthy();
    expect(message.at < bot!.at).toBe(true);

    const listed = await chat.listMessages(general!.id, null);
    const ids = listed.map((m) => m.id);
    expect(ids.indexOf(message.id)).toBeLessThan(ids.indexOf(bot!.id));
  });
});
