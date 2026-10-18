import { createRng, hashString } from '@protoyard/core';

/**
 * Fictional in-channel bots for Relay Labs. Never call a real model —
 * replies are deterministic from seed + prompt hash.
 */
export const BOTS = [
  {
    id: 'bot_relay',
    name: 'Relay',
    handle: 'relay',
    blurb: 'AI teammate that summarizes channels and answers questions (simulated).',
  },
  {
    id: 'bot_standup',
    name: 'Standup Bot',
    handle: 'standup',
    blurb: 'Collects async standups (simulated).',
  },
  {
    id: 'bot_ops',
    name: 'Ops Scout',
    handle: 'ops',
    blurb: 'Summarizes fictional deploy notes.',
  },
] as const;

export type BotId = (typeof BOTS)[number]['id'];

const REPLIES: Record<string, readonly string[]> = {
  bot_relay: [
    'Here is a simulated take: keep the launch checklist tight and ship the demo path first.',
    'Relay (simulated): I would prioritize unblockers, then polish, then the gallery card.',
    'From the fictional channel history, the team is aligned on a Friday cutover.',
  ],
  bot_standup: [
    'Standup noted (simulated). Thanks for the update.',
    'Logged for the daily rollup — no real calendar was touched.',
  ],
  bot_ops: [
    'Deploy window looks clear in this demo world.',
    'Last fictional incident: none open. All green on the mock board.',
  ],
};

/** Deterministic bot reply from seed + prompt (no network, no provider). */
export function botReply(botId: string, prompt: string, seed: number | string): string {
  const lines = REPLIES[botId] ?? ['Acknowledged (simulated bot).'];
  const rng = createRng(hashString(`${String(seed)}:${botId}:${prompt.trim().toLowerCase()}`));
  return rng.pick([...lines]);
}

/**
 * Channel summary for `/summarize` — deterministic from message bodies + seed.
 */
export function summarizeChannel(
  bodies: readonly string[],
  seed: number | string
): string {
  const rng = createRng(hashString(`${String(seed)}:summarize:${bodies.join('\n')}`));
  const sample = bodies
    .map((b) => b.trim())
    .filter(Boolean)
    .slice(-8);
  if (sample.length === 0) {
    return 'Relay summary (simulated): this channel is quiet — no recent messages to fold in.';
  }
  const highlight = rng.pick(sample);
  return `Relay summary (simulated): ${sample.length} recent notes. Theme: “${highlight.slice(0, 72)}${highlight.length > 72 ? '…' : ''}”. Next step looks like unblock the demo path.`;
}

/** True when the message should summon a bot (`@relay` or `/relay`). */
export function matchBot(body: string): (typeof BOTS)[number] | null {
  const text = body.trim().toLowerCase();
  if (text.startsWith('/summarize') || text.startsWith('@relay summarize')) {
    return BOTS[0]!;
  }
  for (const bot of BOTS) {
    if (
      text.startsWith(`/${bot.handle}`) ||
      text.includes(`@${bot.handle}`) ||
      text.startsWith(`@${bot.handle}`)
    ) {
      return bot;
    }
  }
  return null;
}

export const SLASH_COMMANDS = [
  { name: '/summarize', description: 'Ask Relay to summarize this channel' },
  { name: '/relay', description: 'Ping the Relay AI teammate' },
  { name: '/standup', description: 'Ping Standup Bot' },
  { name: '/ops', description: 'Ping Ops Scout' },
  { name: '/huddle', description: 'Start a simulated huddle' },
] as const;
