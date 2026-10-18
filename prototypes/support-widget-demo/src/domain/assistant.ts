import { createRng, hashString } from '@protoyard/core';

export const ASSISTANT = {
  id: 'assistant',
  name: 'Northwind Help',
  color: '#0f766e',
} as const;

const TOPICS: { match: RegExp; reply: string }[] = [
  {
    match: /\b(order|track|shipping|delivery|where)\b/i,
    reply:
      'I can look up a fictional Northwind order. Use “Look up order” with a number like NW-10042, or paste the number here.',
  },
  {
    match: /\b(return|refund|exchange)\b/i,
    reply:
      'Returns are free within 30 fictional days of delivery. Look up your order first, then start a return from the order card.',
  },
  {
    match: /\b(human|agent|person|handoff|someone)\b/i,
    reply:
      'I can connect you with a human agent in this demo. Tap “Talk to a human” below the composer.',
  },
  {
    match: /\b(help|hello|hi)\b/i,
    reply:
      'Hi! I am the Northwind Outfitters (fictional) help bot. Ask about shipping, returns, or hand off to a human anytime.',
  },
];

const FALLBACKS = [
  'Thanks — this is a demo bot for Protoyard. Try looking up order NW-10042, starting a return, or talking to a human.',
  'Got it. Order lookup and returns live in the tools above the composer. Everything here uses fictional data only.',
  'Noted. I can explain shipping windows or help you start a return once an order is on the card.',
];

export function scriptedReply(prompt: string): string {
  const topic = TOPICS.find((t) => t.match.test(prompt));
  if (topic) return topic.reply;
  return createRng(hashString(prompt.trim().toLowerCase())).pick(FALLBACKS);
}

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
  'Welcome to Northwind Outfitters support (fictional). Look up an order, start a return, or talk to a human — no real money moves here.';
