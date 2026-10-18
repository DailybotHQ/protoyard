import { PermissionDeniedError, parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { Message, TeamChatDatabase } from '../src/database/schema.ts';
import { botReply, matchBot } from '../src/domain/bots.ts';
import { createTeamChatServices, TeamChatValidationError } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';
import { generateTeamChatWorld } from '../src/scenarios/generators.ts';
import { applyTeamChatEvent, teamChatTimeline } from '../src/scenarios/timeline.ts';

const SCENARIOS = ['empty', 'busy-day', 'quiet-night', 'viewer'];
const scenario = (id: string) => {
  const input = definition.scenarios.find((s) => s.id === id);
  if (!input) throw new Error(`missing scenario ${id}`);
  return parseScenario(input);
};

describe('team-chat generator', () => {
  it('is deterministic and keeps integrity in every scenario', () => {
    for (const id of SCENARIOS) {
      const s = scenario(id);
      const a = generateTeamChatWorld(createGenerateContext(s));
      expect(generateTeamChatWorld(createGenerateContext(s)), id).toEqual(a);
      expect(
        validateWorld(a, { ...definition.integrity, referenceTime: s.referenceTime }),
        id
      ).toEqual([]);
    }
    expect(
      generateTeamChatWorld(createGenerateContext(scenario('empty'))).tables.messages
    ).toHaveLength(0);
    expect(
      (generateTeamChatWorld(createGenerateContext(scenario('busy-day'))).tables.channels ?? [])
        .length
    ).toBeGreaterThanOrEqual(3);
  });

  it('scripts deterministic bot replies and matches slash mentions', () => {
    expect(botReply('bot_standup', '/standup done', 42)).toBe(
      botReply('bot_standup', '/standup done', 42)
    );
    expect(matchBot('/ops status')?.handle).toBe('ops');
    expect(matchBot('hey @people')?.id).toBe('bot_hr');
    expect(matchBot('hello')).toBeNull();
  });

  it('builds timeline events that only depend on day and stable ids', async () => {
    const s = scenario('busy-day');
    const world = generateTeamChatWorld(createGenerateContext(s));
    const tables = world.tables as Record<string, unknown[]>;
    const read = async (name: string) => {
      if (name === 'py_personas') return world.personas as never[];
      return (tables[name] ?? []) as never[];
    };
    const ctx = {
      ...createGenerateContext(s),
      from: new Date(s.referenceTime),
      to: new Date(Date.parse(s.referenceTime) + 86_400_000),
      read,
    };
    const a = await teamChatTimeline(ctx as never);
    const b = await teamChatTimeline(ctx as never);
    expect(a).toEqual(b);
    expect(a.some((e) => e.type === 'presence.tick')).toBe(true);
  });
});

describe('team-chat services on the real runtime', () => {
  let harness = createHarness<TeamChatDatabase>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<TeamChatDatabase>(definition);
  });

  it('sends a channel message, summons a bot, and both survive reload', async () => {
    let runtime = await harness.boot('empty');
    const chat = createTeamChatServices(runtime);
    const [workspace] = await chat.listWorkspaces();
    expect(workspace).toBeTruthy();
    const channels = await chat.listChannels(workspace!.id);
    const general = channels.find((c) => c.name === 'general');
    expect(general).toBeTruthy();

    const { message, bot } = await chat.sendMessage(general!.id, {
      body: '@standup shipping the demo',
    });
    expect(message.body).toContain('standup');
    expect(bot?.authorKind).toBe('bot');
    expect(bot?.body.length).toBeGreaterThan(0);

    runtime = await harness.reload(runtime);
    const stored = await runtime.db.messages.where('channelId').equals(general!.id).sortBy('at');
    expect(stored.map((m: Message) => m.id)).toEqual(expect.arrayContaining([message.id, bot!.id]));
  });

  it('creates channels, opens DMs, reacts, searches and shares files', async () => {
    const runtime = await harness.boot('busy-day');
    const chat = createTeamChatServices(runtime);
    const [workspace] = await chat.listWorkspaces();
    const channel = await chat.createChannel(workspace!.id, {
      name: 'design-review',
      topic: 'Mockups',
    });
    expect(channel.name).toBe('design-review');

    const people = (await runtime.db.table('py_personas').toArray()) as Array<{ id: string }>;
    const other = people.find((p) => p.id !== runtime.session.principal()?.persona.id);
    expect(other).toBeTruthy();
    const dm = await chat.openDm(workspace!.id, other!.id);
    expect(dm.kind).toBe('dm');

    const { message } = await chat.sendMessage(channel.id, { body: 'Please review' });
    const reaction = await chat.toggleReaction(message.id, '👍');
    expect(reaction?.emoji).toBe('👍');
    expect(await chat.toggleReaction(message.id, '👍')).toBeNull();

    await chat.shareFile(channel.id, { name: 'brief.example.md', sizeBytes: 2048 });
    const hits = await chat.search(workspace!.id, 'review');
    expect(hits.some((m) => m.body.includes('review'))).toBe(true);
  });

  it('starts a simulated huddle with voice captions handle', async () => {
    const runtime = await harness.boot('empty');
    const chat = createTeamChatServices(runtime);
    const [workspace] = await chat.listWorkspaces();
    const [general] = await chat.listChannels(workspace!.id);
    const huddle = await chat.startHuddle(general!.id);
    expect(huddle.endedAt).toBeNull();
    const voice = chat.createHuddleVoice(huddle.id);
    voice.start('push-to-talk');
    const line = await voice.finishListening();
    expect(typeof line === 'string' || line === null).toBe(true);
    voice.stop();
    const ended = await chat.endHuddle(huddle.id);
    expect(ended?.endedAt).toBeTruthy();
  });

  it('denies a viewer from posting', async () => {
    const runtime = await harness.boot('viewer');
    const chat = createTeamChatServices(runtime);
    const [workspace] = await chat.listWorkspaces();
    const channels = await chat.listChannels(workspace!.id);
    await expect(chat.sendMessage(channels[0]!.id, { body: 'Nope' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
  });

  it('rejects empty messages with field errors', async () => {
    const runtime = await harness.boot('empty');
    const chat = createTeamChatServices(runtime);
    const [workspace] = await chat.listWorkspaces();
    const [general] = await chat.listChannels(workspace!.id);
    await expect(chat.sendMessage(general!.id, { body: '  ' })).rejects.toBeInstanceOf(
      TeamChatValidationError
    );
  });

  it('applies timeline presence events', async () => {
    const runtime = await harness.boot('busy-day');
    const events = await teamChatTimeline({
      ...createGenerateContext(scenario('busy-day')),
      from: new Date('2026-06-01T15:30:00.000Z'),
      to: new Date('2026-06-02T15:30:00.000Z'),
      read: (table: string) => runtime.db.table(table).toArray() as never,
    } as never);
    const presenceEvent = events.find((e) => e.type === 'presence.tick');
    expect(presenceEvent).toBeTruthy();
    await applyTeamChatEvent(presenceEvent!, {
      put: async (table, row) => {
        await runtime.db.table(table).put(row);
      },
      get: async (table, id) => runtime.db.table(table).get(id),
      remove: async (table, id) => {
        await runtime.db.table(table).delete(id);
      },
    });
    const payload = presenceEvent!.payload as { personaId: string; status: string };
    const row = await runtime.db.presence.get(`presence:${payload.personaId}`);
    expect(row?.status).toBe(payload.status);
  });
});
