import type { Deck } from '@protoyard/decks/schema';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckApp } from '../src/app/index.ts';
import { debugQueryOn, deckDebugAvailable } from '../src/debug/availability.ts';

/**
 * "Debug for agents" (T-agent-debug-panel, AC-debug-panel-unit): available
 * only in dev, with `?debug=1` or `debug="on"`; on its own lazy chunk; shows
 * the engine's slide record and findings; copies four formats; and keeps
 * hostile slide text inert in the panel and on the clipboard.
 */

const panelLoads = vi.hoisted(() => ({ count: 0 }));

vi.mock('../src/debug/DeckDebugPanel.svelte', async (importOriginal) => {
  panelLoads.count += 1;
  return importOriginal();
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const RLO = String.fromCodePoint(0x202e);
const ZWSP = String.fromCodePoint(0x200b);
const INVISIBLE = new RegExp(
  `[${String.fromCodePoint(0x200b)}-${String.fromCodePoint(0x200f)}${String.fromCodePoint(0x202a)}-${String.fromCodePoint(0x202e)}${String.fromCodePoint(0x2066)}-${String.fromCodePoint(0x2069)}]`
);

function fixtureDeck(title = 'Welcome'): Deck {
  return {
    style: { aspect: '16:9' },
    outline: { title: 'Demo deck', sections: [{ id: 'all', slideIds: ['intro', 'body'] }] },
    slides: [
      {
        id: 'intro',
        layout: 'title-hero',
        props: { title },
        notes: 'Open with the problem the audience already feels every week.',
      },
      {
        id: 'body',
        layout: 'free',
        blocks: [{ type: 'heading', text: 'Body slide', level: 2 }],
      },
    ],
  };
}

function stubClipboard() {
  const writeText = vi.fn(async (_text: string) => {});
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  return writeText;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (navigator as unknown as Record<string, unknown>).clipboard;
  window.history.replaceState(null, '', '/');
});

function mount(debug: 'auto' | 'on' | 'off', deck: Deck = fixtureDeck()) {
  const view = render(DeckApp, { props: { deck, debug, autofocus: true } });
  // Keys go to the stage root (the Texuli stage listens there); the panel listens on window.
  const app = view.container.querySelector('[data-py-deck-app]') as HTMLElement;
  const stage = () => view.container.querySelector('.tx-deck-stage') as HTMLElement;
  return { view, app, stage };
}

const panel = () => document.querySelector<HTMLElement>('[data-py-deck-debug]');

describe('availability', () => {
  it('follows the matrix: dev, ?debug=1, the host switch, and off everywhere else', () => {
    expect(deckDebugAvailable('auto', { dev: true })).toBe(true);
    expect(deckDebugAvailable('auto', { dev: false, search: '?debug=1' })).toBe(true);
    expect(deckDebugAvailable('auto', { dev: false, search: '?print=1&debug=true' })).toBe(true);
    // An export, an artifact, the hosted player: production, no flag.
    expect(deckDebugAvailable('auto', { dev: false, search: '' })).toBe(false);
    expect(deckDebugAvailable('auto', { dev: false, search: '?debug=0' })).toBe(false);
    expect(deckDebugAvailable('on', { dev: false })).toBe(true);
    expect(deckDebugAvailable('off', { dev: true, search: '?debug=1' })).toBe(false);
    expect(debugQueryOn('?debug=yes')).toBe(false);
  });
});

describe('the lazy chunk', () => {
  it('is loaded only when the panel opens', async () => {
    const before = panelLoads.count;
    const { stage } = mount('on');
    expect(panelLoads.count).toBe(before);
    await fireEvent.keyDown(stage(), { key: 'd' });
    await waitFor(() => expect(panel()).not.toBeNull());
    expect(panelLoads.count).toBe(before + 1);
  });
});

describe('the panel', () => {
  it('opens with D, shows the slide record and checks, and Esc closes it first', async () => {
    const { stage } = mount('on');
    await fireEvent.keyDown(stage(), { key: 'd' });
    await waitFor(() => expect(panel()).not.toBeNull());
    await fireEvent.keyDown(stage(), { key: '?' });
    await screen.findByRole('dialog', { name: 'Controls and shortcuts' });
    const sheet = panel() as HTMLElement;
    expect(sheet.querySelector('[data-py-deck-debug-slide]')?.textContent).toBe('intro');
    expect(sheet.querySelector('[data-py-deck-debug-pointer]')?.textContent).toBe('/deck/slides/0');
    expect(sheet.textContent).toContain('title-hero');
    expect(sheet.querySelector('[data-py-deck-debug-text]')?.textContent).toContain('Welcome');
    expect(
      screen.getByRole('button', { name: 'Debug for agents' }).getAttribute('aria-pressed')
    ).toBe('true');
    // The panel and the help dialog are both open: Esc closes the panel first.
    await fireEvent.keyDown(stage(), { key: 'Escape' });
    await waitFor(() => expect(panel()).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Controls and shortcuts' })).toBeTruthy();
  });
});

describe('hostile slide text', () => {
  it('is inert in the panel and on the clipboard', async () => {
    const writeText = stubClipboard();
    const deck = fixtureDeck(`Pay ${RLO}gnp.exe${ZWSP} now`);
    const { stage } = mount('on', deck);
    await fireEvent.keyDown(stage(), { key: 'd' });
    await waitFor(() => expect(panel()).not.toBeNull());
    expect(panel()?.textContent).not.toMatch(INVISIBLE);
    expect(panel()?.textContent).toContain('gnp.exe');

    for (const name of ['reference', 'prompt', 'slide-json']) {
      await fireEvent.click(
        panel()?.querySelector(`[data-py-deck-debug-action="${name}"]`) as HTMLButtonElement
      );
    }
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(3));
    for (const [text] of writeText.mock.calls) expect(text).not.toMatch(INVISIBLE);
    // The JSON keeps the data, escaped, so it round-trips.
    const json = writeText.mock.calls[2]?.[0] ?? '';
    expect(json).toContain('\\u202e');
    expect(JSON.parse(json)).toEqual(deck.slides[0]);
  });
});
