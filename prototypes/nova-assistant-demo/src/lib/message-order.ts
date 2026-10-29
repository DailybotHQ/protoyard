import type { Message } from '../database/schema.ts';

/** Keep a user prompt before its assistant response when their timestamps tie. */
export function sortMessagesForDisplay(messages: readonly Message[]): Message[] {
  return [...messages].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      (left.role === right.role ? 0 : left.role === 'user' ? -1 : 1)
  );
}
