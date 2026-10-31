import type { Deck } from '@protoyard/decks/schema';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckApp } from '../src/app/index.ts';
import { stageDeck, stageThemeKey, themeKeyOf } from '../src/app/stage-deck.ts';

/**
 * DeckApp behaviors fixed after the PLAN_007 Final Review (FR-review-2): the
 * font pair reaches the stage's theme key, the print page shows its loading
 * state, the debug tool joins the stage toolbar (its host tools) and
 * the D key follows the `debug` prop after mount.
 */
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function fixtureDeck(style: Deck['style'] = { aspect: '16:9' }): Deck {
  return {
    style,
    outline: { title: 'Demo deck', sections: [{ id: 'all', slideIds: ['intro', 'body'] }] },
    slides: [
      { id: 'intro', layout: 'title-hero', props: { title: 'Welcome' } },
      { id: 'body', layout: 'free', blocks: [{ type: 'heading', text: 'Body', level: 2 }] },
    ],
  };
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('the font pair reaches the stage theme key (W14)', () => {
  it('a font pair changes the key the stage loads and caches a theme by', () => {
    expect(stageThemeKey({ aspect: '16:9', theme: 'aurora-analytics' })).toBe('aurora-analytics');
    expect(stageThemeKey({ aspect: '16:9', theme: 'aurora-analytics', fontPair: 'humanist' })).toBe(
      'aurora-analytics-font-humanist'
    );
    expect(stageThemeKey({ aspect: '16:9', fontPair: 'editorial' })).toBe('violet-font-editorial');
    const input = stageDeck(fixtureDeck({ aspect: '16:9', fontPair: 'humanist' })).input as {
      style: { theme: string };
    };
    expect(input.style.theme).toBe('violet-font-humanist');
  });

  it('loadTheme gets the theme key back from the stage key', () => {
    expect(themeKeyOf('aurora-analytics-font-humanist', 'humanist')).toBe('aurora-analytics');
    expect(themeKeyOf('seed-00ff8800-font-mono', 'mono')).toBe('seed-00ff8800');
    expect(themeKeyOf('aurora-analytics', undefined)).toBe('aurora-analytics');
    // Another theme reference on the deck (no suffix) is passed through as is.
    expect(themeKeyOf('violet', 'humanist')).toBe('violet');
  });
});

describe('the print page (W15)', () => {
  it('shows a loading status while the print view loads', () => {
    window.history.replaceState(null, '', '/?print=1');
    render(DeckApp, { props: { deck: fixtureDeck(), autofocus: false } });
    const status = screen.getByRole('status');
    expect(status.hasAttribute('data-py-deck-print-loading')).toBe(true);
    expect(status.textContent).toContain('Preparing the slides for printing');
  });
});

describe('the debug tool (I2, I3, G82)', () => {
  it('joins the stage toolbar as a host tool and leaves the progress bar to the stage', async () => {
    const view = render(DeckApp, {
      props: { deck: fixtureDeck({ aspect: '16:9', progress: 'top' }), debug: 'on' },
    });
    await waitFor(() =>
      expect(view.container.querySelector('[data-tx-deck-progress]')).not.toBeNull()
    );
    const bar = view.container.querySelector('[data-tx-deck-progress]') as HTMLElement;
    expect(bar.getAttribute('data-tx-deck-progress')).toBe('top');
    expect(bar.closest('.tx-deck-stage__viewport')).not.toBeNull();
    // The button is the last group of the stage's own toolbar, after its tools.
    const button = screen.getByRole('button', { name: 'Debug for agents' });
    const group = button.closest('[data-tx-deck-host-tools]');
    expect(group).not.toBeNull();
    expect(group?.getAttribute('role')).toBe('group');
    const toolbar = view.container.querySelector('.tx-deck-stage__toolbar');
    expect(toolbar?.contains(button)).toBe(true);
    expect(toolbar?.querySelector('[data-tx-deck-tool="next"]')).not.toBeNull();
  });

  it('adds no host tools group when the panel is off', async () => {
    const view = render(DeckApp, { props: { deck: fixtureDeck(), debug: 'off' } });
    await waitFor(() =>
      expect(view.container.querySelector('[data-tx-deck-tool="next"]')).not.toBeNull()
    );
    expect(view.container.querySelector('[data-tx-deck-host-tools]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Debug for agents' })).toBeNull();
  });

  it('D opens the panel when debug turns on after mount', async () => {
    const view = render(DeckApp, { props: { deck: fixtureDeck(), debug: 'off' } });
    await view.rerender({ deck: fixtureDeck(), debug: 'on' });
    const button = await screen.findByRole('button', { name: 'Debug for agents' });
    await fireEvent.keyDown(window, { key: 'd' });
    await waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('true'));
  });
});
