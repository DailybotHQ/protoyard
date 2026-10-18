import type { GenerateContext, Row, WorldSeed } from '@protoyard/core';
import { generateTeam } from '@protoyard/scenarios';
import { dmKeyFor, memberId, presenceId, reactionId, readMarkerId } from '../database/schema.ts';
import { BOTS } from '../domain/bots.ts';

const REF_CHANNELS = [
  { name: 'general', topic: 'Company-wide (example.com)' },
  { name: 'engineering', topic: 'Builds and reviews' },
  { name: 'random', topic: 'Watercooler' },
] as const;

/**
 * Deterministic team-chat world. Presence and later “incoming” chatter are
 * seeded here; the timeline advances presence while the scenario runs.
 */
export function generateTeamChatWorld(ctx: GenerateContext): WorldSeed {
  const team = generateTeam(ctx);
  const { rng, ids, time } = ctx;
  const orgCreated = new Date(team.organization.createdAt);
  const now = time.now;

  const between = () => time.between(orgCreated, now, rng.next).toISOString();

  const workspace = {
    id: ids.next('workspace'),
    name: `${team.organization.name} HQ`,
    slug: 'hq',
    createdAt: team.organization.createdAt,
  };

  const empty = ctx.scenario.id === 'empty';
  const light = ctx.scenario.id === 'quiet-night' || ctx.scenario.id === 'viewer';

  const channels: Row[] = REF_CHANNELS.map((ch, i) => {
    const at = empty ? team.organization.createdAt : between();
    return {
      id: ids.next('channel'),
      workspaceId: workspace.id,
      kind: 'public',
      name: ch.name,
      topic: ch.topic,
      createdBy: team.actor.id,
      createdAt: at,
      dmKey: null,
      lastMessageAt: at,
      _order: i,
    };
  });

  const channelMembers: Row[] = [];
  for (const channel of channels) {
    for (const persona of team.personas) {
      channelMembers.push({
        id: memberId(channel.id as string, persona.id),
        channelId: channel.id,
        personaId: persona.id,
        role: persona.id === team.actor.id ? 'owner' : 'member',
        joinedAt: team.organization.createdAt,
      });
    }
  }

  // One DM between actor and another persona (when enough people).
  if (!empty && team.personas.length > 1) {
    const other = team.personas.find((p) => p.id !== team.actor.id) ?? team.personas[1]!;
    const at = between();
    const dm = {
      id: ids.next('dm'),
      workspaceId: workspace.id,
      kind: 'dm',
      name: other.name,
      topic: 'Direct message',
      createdBy: team.actor.id,
      createdAt: at,
      dmKey: dmKeyFor(team.actor.id, other.id),
      lastMessageAt: at,
    };
    channels.push(dm);
    for (const personaId of [team.actor.id, other.id]) {
      channelMembers.push({
        id: memberId(dm.id, personaId),
        channelId: dm.id,
        personaId,
        role: 'member',
        joinedAt: at,
      });
    }
  }

  const messages: Row[] = [];
  const reactions: Row[] = [];
  const files: Row[] = [];
  const reads: Row[] = [];

  if (!empty) {
    const general = channels[0]!;
    const eng = channels[1] ?? general;
    const count = light ? 4 : 12;
    let parent: string | null = null;
    for (let i = 0; i < count; i++) {
      const channel = i % 3 === 0 ? eng : general;
      const author = rng.pick(team.personas);
      const at = between();
      const isBot = !light && i % 5 === 4;
      const bot = BOTS[i % BOTS.length]!;
      const id = ids.next('msg');
      const body = isBot ? botReplyLine(bot.id, i) : sampleBody(rng, i, author.name);
      const threadId = !light && i > 3 && i % 4 === 0 && parent ? parent : null;
      messages.push({
        id,
        channelId: channel.id,
        authorId: isBot ? bot.id : author.id,
        authorKind: isBot ? 'bot' : 'person',
        body,
        at,
        threadId,
        fileId: null,
      });
      if (!threadId) parent = id;
      channel.lastMessageAt = at;

      if (!light && i % 3 === 0) {
        const reactor = rng.pick(team.personas);
        const emoji = rng.pick(['👍', '🎉', '👀'] as const);
        reactions.push({
          id: reactionId(id, reactor.id, emoji),
          messageId: id,
          emoji,
          personaId: reactor.id,
          at,
        });
      }
    }

    if (!light) {
      const fileAt = between();
      const fileId = ids.next('file');
      files.push({
        id: fileId,
        channelId: general.id,
        name: 'sprint-plan.example.pdf',
        sizeBytes: 24_576,
        mimeType: 'application/pdf',
        uploadedBy: team.actor.id,
        at: fileAt,
      });
      messages.push({
        id: ids.next('msg'),
        channelId: general.id,
        authorId: team.actor.id,
        authorKind: 'person',
        body: 'Shared sprint-plan.example.pdf',
        at: fileAt,
        threadId: null,
        fileId,
      });
      general.lastMessageAt = fileAt;
    }

    for (const channel of channels) {
      for (const persona of team.personas) {
        reads.push({
          id: readMarkerId(channel.id as string, persona.id),
          channelId: channel.id,
          personaId: persona.id,
          lastReadAt: channel.lastMessageAt as string,
        });
      }
    }
  }

  const presence: Row[] = team.personas.map((persona, i) => ({
    id: presenceId(persona.id),
    personaId: persona.id,
    status: empty
      ? 'offline'
      : i === 0
        ? 'online'
        : rng.pick(['online', 'away', 'offline'] as const),
    statusText: '',
    updatedAt: between(),
  }));

  const channelRows = channels.map((channel) => {
    const { _order: _ignored, ...rest } = channel as Row & { _order?: number };
    return rest;
  });

  return {
    organizations: team.organizations,
    personas: team.personas,
    memberships: team.memberships,
    tables: {
      workspaces: [workspace],
      channels: channelRows,
      channelMembers,
      messages,
      reactions,
      files,
      presence,
      reads,
      huddles: [],
    },
  };
}

function sampleBody(rng: GenerateContext['rng'], index: number, name: string): string {
  const lines = [
    `Shipping the ${rng.pick(['gallery', 'export', 'scenario'])} polish today.`,
    `@${name.split(' ')[0]?.toLowerCase() ?? 'team'} can you review the PR?`,
    'Standup: blocked on copy, otherwise green.',
    'Fictional customer call went well — notes in the doc.',
    '/ops any deploy windows left this week?',
    'Thread: the mobile shell still needs a screenshot.',
  ];
  return lines[index % lines.length]!;
}

function botReplyLine(botId: string, index: number): string {
  if (botId === 'bot_standup') return 'Standup rollup posted (simulated).';
  if (botId === 'bot_ops') return 'No open incidents in this demo world.';
  return `People FAQ #${index} (canned).`;
}
