import type { Deck } from '@protoyard/decks/schema';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPresenter } from '../src/presenter/open.ts';
import PresenterView from '../src/presenter/PresenterView.svelte';
import PresenterHarness from './fixtures/PresenterHarness.svelte';

function fixtureDeck(): Deck {
  return {
    style: { aspect: '16:9' },
    outline: { title: 'Demo', sections: [{ id: 'all', slideIds: ['intro', 'body', 'close'] }] },
    slides: [
      {
        id: 'intro',
        title: 'Welcome',
        layout: 'title-hero',
        props: { title: 'Welcome' },
        notes: 'Say hello and set the agenda.',
        steps: ['a', 'b'],
      },
      {
        id: 'body',
        title: 'Details',
        layout: 'free',
        blocks: [{ type: 'heading', text: 'Details', level: 2 }],
        notes: 'Walk through the three points slowly.',
      },
      {
        id: 'close',
        title: 'Thanks',
        layout: 'closing-cta',
        props: { title: 'Thanks', cta: { label: 'Docs', href: 'https://example.com' } },
        notes: 'Open for questions.',
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PresenterView', () => {
  it('renders notes, timers, position and the next slide', async () => {
    render(PresenterView, {
      deck: fixtureDeck(),
      slideId: 'intro',
      step: 0,
      stepCount: 2,
    });
    await tick();
    expect(screen.getByText('Welcome')).toBeTruthy();
    expect(screen.getByText('Say hello and set the agenda.')).toBeTruthy();
    expect(document.querySelector('[data-py-presenter-next-title]')?.textContent).toMatch(
      /Details/
    );
    expect(document.querySelector('[data-py-presenter-position]')?.textContent).toMatch(/1 \/ 3/);
    expect(document.querySelector('[data-py-presenter-elapsed]')).toBeTruthy();
    expect(document.querySelector('[data-py-presenter-slide-time]')).toBeTruthy();
    expect(document.querySelector('[data-py-presenter-timer-pause]')).toBeTruthy();
    expect(document.querySelector('[data-py-presenter-timer-reset]')).toBeTruthy();
  });
});

describe('openPresenter fallback', () => {
  it('returns fallback when window.open is blocked', () => {
    const result = openPresenter({
      namespace: 'demo',
      position: { slideId: 'intro', step: 0 },
      onRemote: () => {},
      openWindow: () => null,
      broadcast: class {
        name: string;
        constructor(name: string) {
          this.name = name;
        }
        postMessage() {}
        close() {}
        addEventListener() {}
        removeEventListener() {}
      } as unknown as new (
        name: string
      ) => BroadcastChannel,
    });
    expect(result).toEqual({ mode: 'fallback', reason: 'popup-blocked' });
  });

  it('returns fallback when BroadcastChannel is unavailable', () => {
    const result = openPresenter({
      namespace: 'demo',
      position: { slideId: 'intro', step: 0 },
      onRemote: () => {},
      broadcast: null,
    });
    expect(result).toEqual({ mode: 'fallback', reason: 'no-broadcast' });
  });
});

describe('in-page presenter split', () => {
  it('shows the split view with notes and next slide when open', async () => {
    render(PresenterHarness, {
      deck: fixtureDeck(),
      slideId: 'intro',
      step: 0,
      open: true,
      forceFallback: true,
    });
    await waitFor(() => {
      expect(document.querySelector('[data-py-deck-presenter-split]')).toBeTruthy();
    });
    expect(screen.getByText('Say hello and set the agenda.')).toBeTruthy();
    expect(document.querySelector('[data-py-presenter-next-title]')?.textContent).toMatch(
      /Details/
    );
    expect(screen.getByRole('button', { name: /Close presenter/i })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: /Close presenter/i }));
    await waitFor(() => {
      expect(document.querySelector('[data-py-deck-presenter-split]')).toBeNull();
    });
  });
});
