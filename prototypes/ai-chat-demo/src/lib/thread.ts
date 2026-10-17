import type { Conversation, Message } from '../database/schema.ts';

/** Pinned first, then most recent activity. */
export function sortConversations<T extends Conversation>(list: readonly T[]): T[] {
  return [...list].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.lastMessageAt.localeCompare(a.lastMessageAt)
  );
}

export interface MessageGroup {
  key: string;
  authorId: string;
  authorKind: Message['authorKind'];
  messages: Message[];
  /** Set when the group opens a new calendar day (renders a divider). */
  dayStart: string | null;
}

const GROUP_WINDOW_MS = 5 * 60_000;

/** Consecutive messages by one author within five minutes share a header. */
export function groupMessages(messages: readonly Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let previous: Message | null = null;
  for (const message of messages) {
    const newDay =
      previous === null ||
      new Date(previous.at).toDateString() !== new Date(message.at).toDateString();
    const last = groups.at(-1);
    const continues =
      last !== undefined &&
      previous !== null &&
      !newDay &&
      previous.authorId === message.authorId &&
      Date.parse(message.at) - Date.parse(previous.at) <= GROUP_WINDOW_MS;
    if (continues && last) last.messages.push(message);
    else
      groups.push({
        key: message.id,
        authorId: message.authorId,
        authorKind: message.authorKind,
        messages: [message],
        dayStart: newDay ? message.at : null,
      });
    previous = message;
  }
  return groups;
}

/** How many messages a thread renders at first and adds per "Load earlier". */
export const PAGE_SIZE = 60;
