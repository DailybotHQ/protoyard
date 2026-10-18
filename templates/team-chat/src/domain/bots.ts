import { createRng, hashString } from '@protoyard/core';

/** Fictional in-channel bots. They never call a real model. */
export const BOTS = [
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
  {
    id: 'bot_hr',
    name: 'People Pal',
    handle: 'people',
    blurb: 'Answers common team FAQ with canned copy.',
  },
] as const;

export type BotId = (typeof BOTS)[number]['id'];

const REPLIES: Record<string, readonly string[]> = {
  bot_standup: [
    'Standup noted (simulated). Thanks for the update.',
    'Logged for the daily rollup — no real calendar was touched.',
    'Got it. I will nudge the channel at 10:00 simulated time.',
  ],
  bot_ops: [
    'Deploy window looks clear in this demo world.',
    'Last fictional incident: none open. All green on the mock board.',
    'I can draft a release note when you paste the change list.',
  ],
  bot_hr: [
    'PTO requests in this prototype are fiction-only — no real HR system.',
    'Office map: floors 1–3 are example.com HQ placeholders.',
    'Benefits FAQ is canned copy for the demo.',
  ],
};

/** Deterministic bot reply from seed + prompt (no network, no provider). */
export function botReply(botId: string, prompt: string, seed: number | string): string {
  const lines = REPLIES[botId] ?? ['Acknowledged (simulated bot).'];
  const rng = createRng(hashString(`${String(seed)}:${botId}:${prompt.trim().toLowerCase()}`));
  return rng.pick([...lines]);
}

/** True when the message should summon a bot (`@standup` or `/standup`). */
export function matchBot(body: string): (typeof BOTS)[number] | null {
  const text = body.trim().toLowerCase();
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
  { name: '/standup', description: 'Ping Standup Bot' },
  { name: '/ops', description: 'Ping Ops Scout' },
  { name: '/people', description: 'Ping People Pal' },
  { name: '/huddle', description: 'Start a simulated huddle' },
  { name: '/search', description: 'Search messages in this workspace' },
] as const;
