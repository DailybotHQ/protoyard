import { isSameDay, toDate } from '../../lib/date.ts';
import type { ChatMessage } from './types.ts';

export interface MessageGroup {
  key: string;
  authorId: string;
  messages: ChatMessage[];
  /** Set on the first group of a calendar day so the list can render a divider. */
  dayStart: Date | null;
}

/** Consecutive messages from one author within `windowMs` share a header and avatar. */
export function groupMessages(messages: ChatMessage[], windowMs = 5 * 60 * 1000): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let previous: { authorId: string; at: Date } | null = null;
  for (const message of messages) {
    const at = toDate(message.at);
    const newDay = previous === null || !isSameDay(previous.at, at);
    const last = groups[groups.length - 1];
    const continues =
      last !== undefined &&
      !newDay &&
      previous !== null &&
      previous.authorId === message.author.id &&
      at.getTime() - previous.at.getTime() <= windowMs;
    if (continues && last) {
      last.messages.push(message);
    } else {
      groups.push({
        key: message.id,
        authorId: message.author.id,
        messages: [message],
        dayStart: newDay ? at : null,
      });
    }
    previous = { authorId: message.author.id, at };
  }
  return groups;
}
