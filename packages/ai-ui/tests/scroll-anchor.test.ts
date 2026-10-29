import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import MessageList from '../src/MessageList.svelte';
import {
  captureScrollAnchor,
  loadScrollAnchor,
  restoreScrollAnchor,
  saveScrollAnchor,
} from '../src/scroll-anchor.ts';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

/** A viewport whose messages sit at fixed offsets (jsdom has no layout). */
function viewportWith(rows: { id: string; top: number; height: number }[], scrollTop = 0) {
  const viewport = document.createElement('div');
  viewport.scrollTop = scrollTop;
  const viewportTop = 100;
  viewport.getBoundingClientRect = () => ({ top: viewportTop }) as DOMRect;
  for (const row of rows) {
    const element = document.createElement('article');
    element.setAttribute('data-py-message-id', row.id);
    element.getBoundingClientRect = () => {
      const top = viewportTop - viewport.scrollTop + row.top;
      return { top, bottom: top + row.height } as DOMRect;
    };
    viewport.append(element);
  }
  return viewport;
}

describe('conversation scroll anchor', () => {
  it('captures the first message still in view and its offset', () => {
    const viewport = viewportWith(
      [
        { id: 'one', top: 0, height: 40 },
        { id: 'two', top: 40, height: 50 },
        { id: 'three', top: 90, height: 60 },
      ],
      145
    );
    expect(captureScrollAnchor(viewport)).toEqual({
      messageId: 'three',
      offset: 55,
      scrollTop: 145,
    });
  });

  it('restores against the rendered position after earlier messages grew', () => {
    const rows = [
      { id: 'one', top: 0, height: 75 },
      { id: 'two', top: 75, height: 80 },
      { id: 'three', top: 155, height: 60 },
    ];
    const viewport = viewportWith(rows);
    expect(restoreScrollAnchor(viewport, { messageId: 'three', offset: 55 })).toBe(true);
    expect(viewport.scrollTop).toBe(210);
  });

  it('leaves the position alone when the anchored message is not rendered', () => {
    const viewport = viewportWith([{ id: 'replacement', top: 0, height: 40 }], 30);
    expect(restoreScrollAnchor(viewport, { messageId: 'removed', offset: 20 })).toBe(false);
    expect(viewport.scrollTop).toBe(30);
  });

  it('a message outside the virtual window moves to the saved raw position first', () => {
    const viewport = viewportWith([{ id: 'latest', top: 4000, height: 40 }], 3900);
    const anchor = { messageId: 'older', offset: 10, scrollTop: 1200 };
    expect(restoreScrollAnchor(viewport, anchor)).toBe(false);
    expect(viewport.scrollTop).toBe(1200);
  });

  it('round-trips through sessionStorage and ignores malformed state', () => {
    saveScrollAnchor('k', { messageId: 'two', offset: 12, scrollTop: 400 });
    expect(loadScrollAnchor('k')).toEqual({ messageId: 'two', offset: 12, scrollTop: 400 });
    saveScrollAnchor('old', { messageId: 'two', offset: 12 });
    expect(loadScrollAnchor('old')).toEqual({ messageId: 'two', offset: 12 });
    sessionStorage.setItem('bad', '{"messageId":3}');
    expect(loadScrollAnchor('bad')).toBeNull();
    sessionStorage.setItem('broken', '{');
    expect(loadScrollAnchor('broken')).toBeNull();
  });

  it('MessageList saves the reading position per conversation and clears it at the bottom', async () => {
    const messages = [
      { id: 'u1', role: 'user' as const, content: 'Hi', createdAt: '2026-10-17T12:00:00.000Z' },
      {
        id: 'a1',
        role: 'assistant' as const,
        content: 'Hello',
        createdAt: '2026-10-17T12:00:01.000Z',
      },
    ];
    render(MessageList, { messages, conversationId: 'c9' });
    const log = screen.getByRole('log', { name: 'Conversation messages' });
    expect(log.querySelectorAll('[data-py-message-id]').length).toBe(2);
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 400 });
    log.scrollTop = 300;
    log.dispatchEvent(new Event('scroll'));
    expect(loadScrollAnchor('protoyard:ai-ui:scroll:c9')?.messageId).toBeTypeOf('string');
    log.scrollTop = 1600;
    log.dispatchEvent(new Event('scroll'));
    expect(loadScrollAnchor('protoyard:ai-ui:scroll:c9')).toBeNull();
  });
});
