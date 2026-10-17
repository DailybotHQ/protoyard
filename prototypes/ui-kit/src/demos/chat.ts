import type { ChatAuthor, ChatMessage } from '@protoyard/ui';

export const ME: ChatAuthor = { id: 'me', name: 'You' };
export const ANA: ChatAuthor = { id: 'ana', name: 'Ana Lee' };
export const OMAR: ChatAuthor = { id: 'omar', name: 'Omar Diaz' };
export const KAI: ChatAuthor = { id: 'kai', name: 'Kai Moreno' };

/** Today at the given local time, so seeded threads read as "this morning". */
export function today(hours: number, minutes: number): Date {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

let sequence = 0;
export function messageId(): string {
  sequence += 1;
  return `msg-${sequence}`;
}

const REPLIES = [
  'Sounds good, I will take a look after lunch.',
  'Thanks! Can you share the link in the project channel too?',
  'Agreed. Let’s ship it behind the feature flag first.',
  'On it. I will report back before the stand-up.',
];

/** Deterministic canned replies: the n-th reply of a thread is always the same. */
export function scriptedReply(index: number): string {
  return REPLIES[index % REPLIES.length] ?? 'Got it.';
}

export function seedThread(): ChatMessage[] {
  return [
    {
      id: 'seed-1',
      author: ANA,
      body: 'Morning! The new onboarding flow is on staging.',
      at: today(9, 2),
    },
    { id: 'seed-2', author: ANA, body: 'Could you check the copy on step 3?', at: today(9, 3) },
    { id: 'seed-3', author: ME, body: 'Sure, opening it now.', at: today(9, 10), status: 'read' },
  ];
}
