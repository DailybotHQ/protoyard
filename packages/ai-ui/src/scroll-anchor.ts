/**
 * The reading position of one conversation: the first message in view and how
 * far the viewport is scrolled past its top. It survives switching
 * conversations (sessionStorage), and restores against the rendered messages,
 * so it holds when earlier messages change height.
 */
export interface ScrollAnchor {
  messageId: string;
  offset: number;
  /** The raw position, used to bring a virtualized message back into the window. */
  scrollTop?: number;
}

/** Messages carry this attribute with their id (`data-py-message-id`); anchors are read from it. */
export const MESSAGE_ID_ATTRIBUTE = 'data-py-message-id';

function messageTops(viewport: HTMLElement): { id: string; top: number; bottom: number }[] {
  const origin = viewport.getBoundingClientRect().top - viewport.scrollTop;
  return Array.from(viewport.querySelectorAll<HTMLElement>(`[${MESSAGE_ID_ATTRIBUTE}]`)).map(
    (element) => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.getAttribute(MESSAGE_ID_ATTRIBUTE) ?? '',
        top: rect.top - origin,
        bottom: rect.bottom - origin,
      };
    }
  );
}

/** The first rendered message whose bottom is below the viewport top. */
export function captureScrollAnchor(viewport: HTMLElement): ScrollAnchor | null {
  const top = viewport.scrollTop;
  const messages = messageTops(viewport);
  const first = messages.find((message) => message.bottom > top) ?? messages.at(-1);
  return first?.id ? { messageId: first.id, offset: top - first.top, scrollTop: top } : null;
}

/**
 * Scrolls back to the anchor; false when that message is not rendered. A
 * virtual list renders only the rows near the viewport, so a miss moves to the
 * saved raw position (when there is one) to bring the message into the window;
 * the caller retries after the list re-renders.
 */
export function restoreScrollAnchor(viewport: HTMLElement, anchor: ScrollAnchor): boolean {
  const message = messageTops(viewport).find((item) => item.id === anchor.messageId);
  if (!message) {
    if (anchor.scrollTop !== undefined) viewport.scrollTop = anchor.scrollTop;
    return false;
  }
  viewport.scrollTop = Math.max(0, message.top + anchor.offset);
  return true;
}

export function saveScrollAnchor(key: string, anchor: ScrollAnchor | null): void {
  if (!anchor || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(key, JSON.stringify(anchor));
  } catch {
    // Storage can be unavailable in private browsing or quota-constrained contexts.
  }
}

export function clearScrollAnchor(key: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in private browsing or quota-constrained contexts.
  }
}

export function loadScrollAnchor(key: string): ScrollAnchor | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (
      typeof value === 'object' &&
      value !== null &&
      'messageId' in value &&
      typeof value.messageId === 'string' &&
      'offset' in value &&
      typeof value.offset === 'number' &&
      Number.isFinite(value.offset)
    )
      return {
        messageId: value.messageId,
        offset: value.offset,
        ...('scrollTop' in value &&
        typeof value.scrollTop === 'number' &&
        Number.isFinite(value.scrollTop)
          ? { scrollTop: value.scrollTop }
          : {}),
      };
  } catch {
    // Ignore stale or malformed saved state.
  }
  return null;
}
