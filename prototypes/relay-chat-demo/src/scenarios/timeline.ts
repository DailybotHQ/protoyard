import type { DomainEvent, EventApplyContext, TimelineContext } from '@protoyard/core';
import { presenceId } from '../database/schema.ts';

const DAY_MS = 86_400_000;

/**
 * Deterministic presence + chatter events. Emits one presence tick per day
 * in (from, to] and optional busy-day chatter, using stable ids only.
 */
export async function teamChatTimeline(ctx: TimelineContext): Promise<DomainEvent[]> {
  const personas = await ctx.read('py_personas');
  if (personas.length === 0) return [];
  const channels = await ctx.read('channels');
  const general = channels.find((c) => c.name === 'general');
  const events: DomainEvent[] = [];

  const fromDay = Math.floor(ctx.from.getTime() / DAY_MS);
  const toDay = Math.floor(ctx.to.getTime() / DAY_MS);

  for (let day = fromDay; day <= toDay; day += 1) {
    const dayStart = day * DAY_MS;
    const persona = personas[day % personas.length]!;
    const statuses = ['online', 'away', 'offline'] as const;
    const status = statuses[day % statuses.length]!;
    const presenceAt = new Date(dayStart + 60_000);
    if (presenceAt.getTime() > ctx.from.getTime() && presenceAt.getTime() <= ctx.to.getTime()) {
      events.push({
        id: `presence_${persona.id}_${day}`,
        type: 'presence.tick',
        at: presenceAt.toISOString(),
        source: 'timeline',
        payload: {
          personaId: persona.id,
          status,
          statusText: status === 'away' ? 'In a fictional meeting' : '',
        },
      });
    }

    if (general && ctx.scenario.id === 'busy-day' && day % 2 === 0) {
      const author = personas[(day + 1) % personas.length]!;
      const chatterAt = new Date(dayStart + 3_600_000);
      if (chatterAt.getTime() > ctx.from.getTime() && chatterAt.getTime() <= ctx.to.getTime()) {
        events.push({
          id: `chatter_${day}`,
          type: 'message.incoming',
          at: chatterAt.toISOString(),
          source: 'timeline',
          payload: {
            channelId: general.id,
            authorId: author.id,
            body: `Timeline ping #${day}: standup notes are in #general (simulated).`,
          },
        });
      }
    }
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
      id: `msg_${event.id}`,
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
