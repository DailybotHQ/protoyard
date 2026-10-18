import {
  createRuntimeId,
  type DomainEvent,
  type EventApplyContext,
  type TimelineContext,
} from '@protoyard/core';
import { presenceId } from '../database/schema.ts';

/**
 * Deterministic presence + chatter events. Only depend on the day index and
 * stable persona ids (never Date.now / Math.random). Reads the live DB via
 * `ctx.read` so channel ids match the seeded world.
 */
export async function teamChatTimeline(ctx: TimelineContext): Promise<DomainEvent[]> {
  const personas = await ctx.read('py_personas');
  if (personas.length === 0) return [];
  const day = Math.floor(ctx.from.getTime() / 86_400_000);
  const events: DomainEvent[] = [];

  const persona = personas[day % personas.length]!;
  const statuses = ['online', 'away', 'offline'] as const;
  const status = statuses[day % statuses.length]!;
  events.push({
    id: `presence_${persona.id}_${day}`,
    type: 'presence.tick',
    at: new Date(ctx.from.getTime() + 60_000).toISOString(),
    source: 'timeline',
    payload: {
      personaId: persona.id,
      status,
      statusText: status === 'away' ? 'In a fictional meeting' : '',
    },
  });

  const channels = await ctx.read('channels');
  const general = channels.find((c) => c.name === 'general');

  if (general && ctx.scenario.id === 'busy-day' && day % 2 === 0) {
    const author = personas[(day + 1) % personas.length]!;
    events.push({
      id: `chatter_${day}`,
      type: 'message.incoming',
      at: new Date(ctx.from.getTime() + 3_600_000).toISOString(),
      source: 'timeline',
      payload: {
        channelId: general.id,
        authorId: author.id,
        body: `Timeline ping #${day}: standup notes are in #general (simulated).`,
      },
    });
  }

  return events;
}

export async function applyTeamChatEvent(
  event: DomainEvent,
  ctx: EventApplyContext
): Promise<void> {
  if (event.type === 'presence.tick') {
    const payload = event.payload as {
      personaId: string;
      status: 'online' | 'away' | 'offline';
      statusText: string;
    };
    await ctx.put('presence', {
      id: presenceId(payload.personaId),
      personaId: payload.personaId,
      status: payload.status,
      statusText: payload.statusText,
      updatedAt: event.at,
    });
    return;
  }

  if (event.type === 'message.incoming') {
    const payload = event.payload as { authorId: string; body: string; channelId: string };
    const channel = await ctx.get('channels', payload.channelId);
    if (!channel) return;
    await ctx.put('messages', {
      id: createRuntimeId('msg'),
      channelId: payload.channelId,
      authorId: payload.authorId,
      authorKind: 'person',
      body: payload.body,
      at: event.at,
      threadId: null,
      fileId: null,
    });
    await ctx.put('channels', { ...channel, lastMessageAt: event.at });
  }
}
