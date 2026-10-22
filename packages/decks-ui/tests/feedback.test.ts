import type { Deck } from '@protoyard/decks/schema';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckApp } from '../src/app/index.ts';
import { BLACKOUT_HINT_MS } from '../src/chrome/BlackoutScreen.svelte';
import { ChromeToast, LaserPointer, TOAST_DURATION_MS } from '../src/chrome/index.ts';
import { PrintButton } from '../src/print/index.ts';

/**
 * Visible feedback (T-print-and-feedback, AC-feedback-unit): Print enters the
 * deck's one-slide-per-page layout before the dialog opens, and copy,
 * blackout and laser each answer on screen, not only to assistive tech.
 */

vi.mock('../src/layouts/index.ts', async () => {
  const Mock = (await import('./fixtures/MockLayoutRenderer.svelte')).default;
  return { DeckLayoutRenderer: Mock };
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Slides named only by their layout's title prop, as most catalog slides are. */
function fixtureDeck(): Deck {
  return {
    style: { aspect: '16:9' },
    outline: { title: 'Demo deck', sections: [{ id: 'all', slideIds: ['cover', 'body'] }] },
    slides: [
      { id: 'cover', layout: 'title-hero', props: { title: 'Welcome' } },
      { id: 'body', layout: 'title-hero', props: { title: 'Body' } },
    ],
  };
}

function stubClipboard(impl: (text: string) => Promise<void>) {
  const writeText = vi.fn(impl);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  return writeText;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (navigator as unknown as Record<string, unknown>).clipboard;
  delete (document as unknown as Record<string, unknown>).execCommand;
  window.location.hash = '';
});

function mount() {
  const view = render(DeckApp, { props: { deck: fixtureDeck(), autofocus: true } });
  const app = view.container.querySelector('[data-py-deck-app]') as HTMLElement;
  app.focus();
  return { view, app };
}

describe('print', () => {
  it('the Print button enters the print layout before the dialog opens', async () => {
    const seen: boolean[] = [];
    vi.stubGlobal('print', () => {
      seen.push(document.querySelector('[data-py-deck-print]') !== null);
    });
    mount();
    await fireEvent.click(await screen.findByRole('button', { name: 'Print, one slide per page' }));
    await waitFor(() => expect(seen).toEqual([true]));
  });

  it('PrintButton calls onprint when a host passes it, else window.print', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    const onprint = vi.fn();
    render(PrintButton, { props: { onprint } });
    await fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(onprint).toHaveBeenCalledTimes(1);
    expect(print).not.toHaveBeenCalled();
    cleanup();
    render(PrintButton);
    await fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalledTimes(1);
  });
});

describe('copy feedback', () => {
  it('copies a plain link to the slide and confirms visibly', async () => {
    const writeText = stubClipboard(async () => {});
    const { view } = mount();
    await fireEvent.click(await screen.findByRole('button', { name: 'Copy link to this slide' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.href.split('#')[0]}#/cover/0`);
    const toast = await waitFor(() => {
      const node = view.container.querySelector('[data-py-deck-toast]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(toast.textContent?.trim()).toBe('Link to slide 1 copied');
    expect(toast.dataset.tone).toBe('info');
    // One polite region announces it; the visible twin is hidden from assistive tech.
    const live = view.container.querySelectorAll('[data-py-deck-copy-status]');
    expect(live).toHaveLength(1);
    expect(live[0]?.textContent).toBe('Link to slide 1 copied');
    expect(toast.getAttribute('aria-hidden')).toBe('true');
  });

  it('says so, visibly, when the clipboard is refused', async () => {
    stubClipboard(async () => {
      throw new Error('denied');
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false });
    const { view } = mount();
    await fireEvent.click(await screen.findByRole('button', { name: 'Copy link to this slide' }));
    await waitFor(() =>
      expect(view.container.querySelector('[data-py-deck-toast]')?.textContent?.trim()).toBe(
        'Could not copy the link'
      )
    );
    expect((view.container.querySelector('[data-py-deck-toast]') as HTMLElement).dataset.tone).toBe(
      'error'
    );
  });
});

describe('ChromeToast', () => {
  it('replaces rather than stacks, fades after 2.5 s and pauses under the pointer', async () => {
    vi.useFakeTimers();
    const { component, container } = render(ChromeToast);
    const toast = () => container.querySelectorAll('[data-py-deck-toast]');
    component.show('First');
    await vi.advanceTimersByTimeAsync(0);
    component.show('Second');
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
    expect(toast()).toHaveLength(1);
    expect(toast()[0]?.textContent?.trim()).toBe('Second');

    await fireEvent.pointerEnter(toast()[0] as HTMLElement);
    await vi.advanceTimersByTimeAsync(TOAST_DURATION_MS * 2);
    flushSync();
    expect(toast()).toHaveLength(1);
    await fireEvent.pointerLeave(toast()[0] as HTMLElement);
    await vi.advanceTimersByTimeAsync(TOAST_DURATION_MS);
    flushSync();
    expect(toast()).toHaveLength(0);
    expect(container.querySelector('[data-py-deck-toast-live]')?.textContent).toBe('');
  });
});

describe('blackout', () => {
  it('says how to come back for two seconds, then goes fully black', async () => {
    vi.useFakeTimers();
    const { app, view } = mount();
    await fireEvent.keyDown(app, { key: 'b' });
    flushSync();
    const hint = () =>
      view.container.querySelector('[data-py-deck-blackout-hint]') as HTMLElement | null;
    expect(hint()?.textContent?.trim()).toBe('Screen blacked out — press B or click to return');
    expect(hint()?.dataset.visible).toBe('true');
    await vi.advanceTimersByTimeAsync(BLACKOUT_HINT_MS);
    flushSync();
    expect(hint()?.dataset.visible).toBe('false');
    // A click on the screen still brings the slide back.
    await fireEvent.click(view.container.querySelector('[data-py-deck-blackout]') as HTMLElement);
    flushSync();
    expect(view.container.querySelector('[data-py-deck-blackout]')).toBeNull();
  });
});

describe('laser', () => {
  it('shows a chip and the dot as soon as it is on, and both go when it is off', async () => {
    const { app, view } = mount();
    await fireEvent.keyDown(app, { key: 'l' });
    await waitFor(() => expect(app.dataset.laser).toBe('true'));
    expect(view.container.querySelector('[data-py-deck-laser-chip]')?.textContent?.trim()).toBe(
      'Laser on'
    );
    expect(view.container.querySelector('[data-py-deck-laser-dot]')).not.toBeNull();
    await fireEvent.keyDown(app, { key: 'l' });
    await waitFor(() => expect(app.dataset.laser).toBeUndefined());
    expect(view.container.querySelector('[data-py-deck-laser-chip]')).toBeNull();
  });

  it('starts at the last pointer position and keeps a tapped dot when the finger lifts', async () => {
    const host = document.body.appendChild(document.createElement('div'));
    host.getBoundingClientRect = () => new DOMRect(100, 50, 800, 450);
    const { container } = render(LaserPointer, {
      props: { container: host, start: { x: 300, y: 150 } },
    });
    const dot = () => container.querySelector('[data-py-deck-laser-dot]') as HTMLElement | null;
    expect([dot()?.style.left, dot()?.style.top]).toEqual(['200px', '100px']);

    host.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 500, clientY: 250, pointerType: 'touch' })
    );
    host.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'touch' }));
    flushSync();
    expect([dot()?.style.left, dot()?.style.top]).toEqual(['400px', '200px']);

    host.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    flushSync();
    expect(dot()).toBeNull();
    host.remove();
  });
});
