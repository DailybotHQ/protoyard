import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MessageList from '../src/MessageList.svelte';
import { loadReadingAnchor, readingAnchorKey, saveReadingAnchor } from '../src/scroll-anchor.ts';
import type { AssistantMessage } from '../src/types.ts';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.useRealTimers();
});

const messages: AssistantMessage[] = [
  { id: 'u1', role: 'user' as const, content: 'Hi', createdAt: '2026-10-17T12:00:00.000Z' },
  { id: 'a1', role: 'assistant' as const, content: 'Hello', createdAt: '2026-10-17T12:00:01.000Z' },
];

/** jsdom has no layout: rows sit 300 px apart in a 400 px tall, scrolled log. */
function layOut(log: HTMLElement) {
  Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 2000 });
  Object.defineProperty(log, 'clientHeight', { configurable: true, value: 400 });
  log.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
  for (const [index, row] of [
    ...log.querySelectorAll<HTMLElement>('[data-message-id]'),
  ].entries()) {
    row.getBoundingClientRect = () => {
      const top = 100 - log.scrollTop + index * 300;
      return { top, bottom: top + 300 } as DOMRect;
    };
  }
}

describe('conversation reading position (Texuli anchor, G71)', () => {
  it('round-trips through sessionStorage, drops positions at the latest message and malformed state', () => {
    saveReadingAnchor('k', { messageId: 'two', offset: -12, atLatest: false });
    expect(loadReadingAnchor('k')).toEqual({ messageId: 'two', offset: -12, atLatest: false });
    saveReadingAnchor('k', { messageId: 'two', offset: 0, atLatest: true });
    expect(loadReadingAnchor('k')).toBeNull();
    sessionStorage.setItem('bad', '{"messageId":3}');
    expect(loadReadingAnchor('bad')).toBeNull();
    sessionStorage.setItem('broken', '{');
    expect(loadReadingAnchor('broken')).toBeNull();
  });

  it('MessageList stores the reader position per conversation and clears it at the bottom', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    render(MessageList, { messages, conversationId: 'c9' });
    const log = screen.getByRole('log', { name: 'Conversation messages' });
    layOut(log);
    log.scrollTop = 340;
    log.dispatchEvent(new Event('scroll'));
    vi.advanceTimersToNextFrame();
    // a1 crosses the top edge: its top is 40 px above the view.
    expect(loadReadingAnchor(readingAnchorKey('c9'))).toEqual({
      messageId: 'a1',
      offset: -40,
      atLatest: false,
    });
    log.scrollTop = 1600;
    log.dispatchEvent(new Event('scroll'));
    vi.advanceTimersToNextFrame();
    expect(loadReadingAnchor(readingAnchorKey('c9'))).toBeNull();
  });

  it('reopening a conversation hands its saved anchor to Texuli, which scrolls back to it', async () => {
    saveReadingAnchor(readingAnchorKey('c7'), { messageId: 'a1', offset: -40, atLatest: false });
    const view = render(MessageList, { messages, conversationId: 'c7' });
    const log = screen.getByRole('log', { name: 'Conversation messages' });
    layOut(log);
    // Re-render with a fresh messages array: Texuli restores a pending anchor once rows exist.
    await view.rerender({ messages: [...messages], conversationId: 'c7' });
    await vi.waitFor(() => expect(log.scrollTop).toBe(340));
  });

  it("day separators are Texuli's own full-width rows, outside the avatar row (G70)", () => {
    render(MessageList, {
      messages: messages.map((m, i) =>
        i === 0 ? { ...m, createdAt: '2026-10-16T12:00:00.000Z' } : m
      ),
      conversationId: 'c3',
    });
    const separators = document.querySelectorAll('[role="separator"].tx-chat-message-list__day');
    expect(separators.length).toBe(2);
    for (const separator of separators)
      expect(separator.closest('.tx-chat-message-group__row')).toBeNull();
  });
});
