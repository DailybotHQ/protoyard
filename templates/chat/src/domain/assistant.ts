import { createRng, hashString } from '@protoyard/core';

/**
 * The scripted assistant. A reply is a pure function of the prompt, so the
 * same question always gets the same answer: reproducible demos, no model
 * API. Replace `TOPICS` with your product's voice.
 */

export const ASSISTANT = {
  id: 'assistant',
  name: 'Assistant',
  color: '#38bdf8',
} as const;

const TOPICS: { match: RegExp; reply: string }[] = [
  {
    match: /\b(summar|recap|tl;?dr)/i,
    reply:
      'Here is a short summary of this conversation so far. The team agreed on the next step, two questions are still open, and nobody is blocked. Want me to list the open questions?',
  },
  {
    match: /\b(idea|brainstorm|suggest)/i,
    reply:
      'A few ideas to start with: keep the first version small, test it with three real people this week, and write down what surprised you. Pick one and I can expand it.',
  },
  {
    match: /\b(help|how)\b/i,
    reply:
      'I am a scripted assistant in a prototype. Ask me to summarize, brainstorm or explain, and I will answer the same way every time, so demos stay predictable.',
  },
];

const FALLBACKS = [
  'Got it. I would start with the smallest step that proves the idea, then look at the results before doing more.',
  'Noted. Tell me a bit more about the goal and I will suggest a first step.',
  'Thanks. I have added that to the conversation context. Ask me to summarize whenever you are ready.',
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
