import type { ChatReadingAnchor } from '@texuli/chat';

/**
 * The reading position of one conversation, kept in sessionStorage so it
 * survives switching conversations in the tab. `@texuli/chat`'s MessageList
 * captures and restores it (`anchor`, `onAnchorChange`, G71); this module only
 * stores it. A position at the latest message is not stored: the list opens
 * there anyway.
 */
export type { ChatReadingAnchor };

/** Storage key for a conversation (v2: Texuli's anchor, offset measured from the viewport top). */
export const readingAnchorKey = (conversationId: string) =>
  `protoyard:ai-ui:reading:${conversationId}`;

export function saveReadingAnchor(key: string, anchor: ChatReadingAnchor): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (anchor.atLatest) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(anchor));
  } catch {
    // Storage can be unavailable in private browsing or quota-constrained contexts.
  }
}

export function loadReadingAnchor(key: string): ChatReadingAnchor | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (
      typeof value === 'object' &&
      value !== null &&
      'messageId' in value &&
      typeof value.messageId === 'string' &&
      value.messageId !== '' &&
      'offset' in value &&
      typeof value.offset === 'number' &&
      Number.isFinite(value.offset)
    )
      return { messageId: value.messageId, offset: value.offset, atLatest: false };
  } catch {
    // Ignore stale or malformed saved state.
  }
  return null;
}
