import type { Deck } from '@protoyard/decks/schema';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckApp } from '../src/app/index.ts';
import { debugQueryOn, deckDebugAvailable } from '../src/debug/availability.ts';
import { deckFileName, inertJson } from '../src/debug/format.ts';
import { buildDeckEntry, cleanupDeckBuild, gzip, initialChunks } from './bundle-support.ts';

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

vi.mock('../src/layouts/index.ts', async () => {
  const Mock = (await import('./fixtures/MockLayoutRenderer.svelte')).default;
  return { DeckLayoutRenderer: Mock };
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
  const app = view.container.querySelector('[data-py-deck-app]') as HTMLElement;
  app.focus();
  return { view, app };
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

  it('has no control and ignores D when off', async () => {
    const { app } = mount('off');
    expect(screen.queryByRole('button', { name: 'Debug for agents' })).toBeNull();
    await fireEvent.keyDown(app, { key: 'd' });
    expect(panel()).toBeNull();
  });

  it('honours ?debug=1 on a production page', async () => {
    window.history.replaceState(null, '', '/?debug=1');
    mount('auto');
    expect(screen.getByRole('button', { name: 'Debug for agents' })).toBeTruthy();
  });
});

describe('the lazy chunk', () => {
  it('is loaded only when the panel opens', async () => {
    const before = panelLoads.count;
    const { app } = mount('on');
    expect(panelLoads.count).toBe(before);
    await fireEvent.keyDown(app, { key: 'd' });
    await waitFor(() => expect(panel()).not.toBeNull());
    expect(panelLoads.count).toBe(before + 1);
  });

  it('stays out of the deck entry and under 12 KB gzip', async () => {
    const { dir, output } = await buildDeckEntry();
    try {
      const initial = initialChunks(output);
      const isPanel = (id: string) => id.includes('/decks-ui/src/debug/DeckDebugPanel.svelte');
      expect(initial.some((chunk) => Object.keys(chunk.modules).some(isPanel))).toBe(false);
      const lazy = output.chunks.find((chunk) => Object.keys(chunk.modules).some(isPanel));
      expect(lazy).toBeDefined();
      expect(gzip(lazy?.code ?? '')).toBeLessThanOrEqual(12 * 1024);
    } finally {
      await cleanupDeckBuild(dir);
    }
  }, 120_000);
});

describe('the panel', () => {
  it('opens with D, shows the slide record and checks, and Esc closes it first', async () => {
    const { app } = mount('on');
    await fireEvent.keyDown(app, { key: 'd' });
    await waitFor(() => expect(panel()).not.toBeNull());
    await fireEvent.keyDown(app, { key: '?' });
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
    await fireEvent.keyDown(app, { key: 'Escape' });
    await waitFor(() => expect(panel()).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Controls and shortcuts' })).toBeTruthy();
  });

  it('leaves the panel alone while the presenter hides it', async () => {
    const { app } = mount('on');
    await fireEvent.keyDown(app, { key: 'd' });
    await waitFor(() => expect(panel()).not.toBeNull());
    await fireEvent.keyDown(app, { key: 'p' });
    await waitFor(() => expect(panel()).toBeNull());
    expect(app.getAttribute('data-presenter')).toBe('true');
    // Esc reaches nothing visible here: the hidden panel stays open.
    await fireEvent.keyDown(app, { key: 'Escape' });
    await fireEvent.keyDown(app, { key: 'p' });
    expect(app.getAttribute('data-presenter')).not.toBe('true');
    await waitFor(() => expect(panel()).not.toBeNull());
    // Nor does D.
    await fireEvent.keyDown(app, { key: 'p' });
    await waitFor(() => expect(panel()).toBeNull());
    await fireEvent.keyDown(app, { key: 'd' });
    await fireEvent.keyDown(app, { key: 'p' });
    await waitFor(() => expect(panel()).not.toBeNull());
  });

  it('lists the slide checks and jumps to other slides with findings', async () => {
    const { app } = mount('on');
    await fireEvent.keyDown(app, { key: 'd' });
    await waitFor(() => expect(panel()).not.toBeNull());
    // The free slide has no speaker notes: a finding on another slide.
    const jump = panel()?.querySelector<HTMLButtonElement>('[data-py-deck-debug-jump="body"]');
    expect(jump).not.toBeNull();
    await fireEvent.click(jump as HTMLButtonElement);
    await waitFor(() => expect(app.dataset.slideId).toBe('body'));
    await waitFor(() =>
      expect(panel()?.querySelector('[data-py-deck-debug-slide]')?.textContent).toBe('body')
    );
    const findings = panel()?.querySelector('[data-py-deck-debug-findings]');
    expect(findings?.textContent).toContain('notes-missing');
    expect(findings?.textContent).toContain('/deck/slides/1/notes');
  });

  it('copies the agent reference, the prompt and the slide JSON in their formats', async () => {
    const writeText = stubClipboard();
    const deck = fixtureDeck();
    const { app } = mount('on', deck);
    await fireEvent.keyDown(app, { key: 'd' });
    await waitFor(() => expect(panel()).not.toBeNull());
    const action = (name: string) =>
      panel()?.querySelector<HTMLButtonElement>(
        `[data-py-deck-debug-action="${name}"]`
      ) as HTMLButtonElement;

    await fireEvent.click(action('reference'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const line = writeText.mock.calls[0]?.[0] ?? '';
    expect(line.startsWith('[slide-ref] ')).toBe(true);
    expect(line).toContain(' id=intro ');
    expect(line).toContain('pointer=/deck/slides/0');
    expect(line.includes('\n')).toBe(false);

    await fireEvent.click(action('prompt'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    const prompt = writeText.mock.calls[1]?.[0] ?? '';
    expect(prompt.startsWith('## Slide reference:')).toBe(true);
    expect(prompt).toContain('### How to change it');

    await fireEvent.click(action('slide-json'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(3));
    expect(JSON.parse(writeText.mock.calls[2]?.[0] ?? '')).toEqual(deck.slides[0]);
    await waitFor(() =>
      expect(document.querySelector('[data-py-deck-toast]')?.textContent?.trim()).toBe(
        'Slide JSON copied'
      )
    );
  });

  it('downloads the deck JSON without the network', async () => {
    const blobs: Blob[] = [];
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: (blob: Blob) => {
          blobs.push(blob);
          return 'blob:deck';
        },
        revokeObjectURL: () => {},
      })
    );
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const clicks: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicks.push(this.download);
    });
    const deck = fixtureDeck();
    const { app } = mount('on', deck);
    await fireEvent.keyDown(app, { key: 'd' });
    await waitFor(() => expect(panel()).not.toBeNull());
    await fireEvent.click(
      panel()?.querySelector('[data-py-deck-debug-action="download"]') as HTMLButtonElement
    );
    expect(clicks).toEqual(['demo-deck.deck.json']);
    expect(JSON.parse(await (blobs[0] as Blob).text())).toEqual(deck);
    expect(fetchSpy).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it('draws block outlines that never take the pointer', async () => {
    const { app } = mount('on');
    await fireEvent.keyDown(app, { key: 'd' });
    await waitFor(() => expect(panel()).not.toBeNull());
    const toggle = panel()?.querySelector(
      '[data-py-deck-debug-action="outline"]'
    ) as HTMLButtonElement;
    await fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    const layer = await waitFor(() => {
      const node = document.querySelector<HTMLElement>('[data-py-deck-outline]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(layer.className).toContain('pointer-events-none');
    expect(layer.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('hostile slide text', () => {
  it('is inert in the panel and on the clipboard', async () => {
    const writeText = stubClipboard();
    const deck = fixtureDeck(`Pay ${RLO}gnp.exe${ZWSP} now`);
    const { app } = mount('on', deck);
    await fireEvent.keyDown(app, { key: 'd' });
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

  it('inertJson escapes every invisible character and round-trips', () => {
    const value = { text: `a${RLO}b${ZWSP}c${String.fromCodePoint(0x2028)}d` };
    const out = inertJson(value);
    expect(out).not.toMatch(INVISIBLE);
    expect(JSON.parse(out)).toEqual(value);
    expect(deckFileName(`../../${RLO}etc`)).toBe('etc.deck.json');
    expect(deckFileName(null)).toBe('deck.deck.json');
  });
});

it('keeps the panel together with a stable hook', () => {
  // The hook other tasks and agents rely on.
  const { app } = mount('on');
  expect(within(app).getByRole('button', { name: 'Debug for agents' }).dataset.pyDeckTool).toBe(
    'debug'
  );
});
