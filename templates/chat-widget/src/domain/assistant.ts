import { createRng, hashString } from '@protoyard/core';

/**
 * Scripted support assistant. A reply is a pure function of the prompt so demos
 * stay reproducible. No model API.
 */

export const ASSISTANT = {
  id: 'assistant',
  name: 'Support bot',
  color: '#0f766e',
} as const;

const TOPICS: { match: RegExp; reply: string }[] = [
  {
    match: /\b(ship|shipping|delivery|track)/i,
    reply:
      'Orders from Northwind Outfitters (fictional) ship in 2–4 demo days. Use your order id from the confirmation email — I can walk you through tracking steps if you paste it here.',
  },
  {
    match: /\b(return|refund|exchange)/i,
    reply:
      'Returns are free within 30 fictional days. Start a return from your account page, or ask me to hand you to a human agent for a refund review.',
  },
  {
    match: /\b(human|agent|person|handoff|someone)/i,
    reply:
      'I can request a human agent for you. Use the “Talk to a human” button below the composer — they will join this same thread in the simulation.',
  },
  {
    match: /\b(help|how|hello|hi)\b/i,
    reply:
      'Hi! I am a scripted support bot in a Protoyard widget. Ask about shipping, returns, or sizing, or hand off to a human anytime.',
  },
];

const FALLBACKS = [
  'Thanks for writing. I am a demo bot — try asking about shipping, returns, or handoff to a human.',
  'Got it. For order-specific help, paste an order id, or tap “Talk to a human” for a live agent simulation.',
  'Noted. I can summarize options for shipping or returns, or connect you with a human agent.',
];

export function scriptedReply(prompt: string): string {
  const topic = TOPICS.find((t) => t.match.test(prompt));
  if (topic) return topic.reply;
  return createRng(hashString(prompt.trim().toLowerCase())).pick(FALLBACKS);
}

/** Splits a reply into stream chunks of a few words (deterministic). */
export function chunkReply(text: string): string[] {
  const words = text.split(/(\s+)/);
  const rng = createRng(hashString(text));
  const chunks: string[] = [];
  let current = '';
  let left = rng.int(2, 5) * 2;
  for (const piece of words) {
    current += piece;
    if (--left <= 0) {
      chunks.push(current);
      current = '';
      left = rng.int(2, 5) * 2;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export const GREETING =
  'Welcome to Northwind Outfitters support (fictional). Ask about shipping, returns, or sizing — or talk to a human anytime.';
