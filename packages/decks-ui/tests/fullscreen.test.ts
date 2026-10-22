import type { Deck } from '@protoyard/decks/schema';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckApp } from '../src/app/index.ts';
import {
  createDeckFullscreen,
  type DeckFullscreenMode,
  DeckToolbar,
  FULLSCREEN_OVERLAY_IDLE_MS,
  FULLSCREEN_WINDOW_DESCRIPTION,
} from '../src/chrome/index.ts';

/**
 * Full screen (T-fullscreen-fix, AC-fullscreen-unit): the state follows the
 * document, a missing or refused Fullscreen API falls back to filling the
 * window, Escape leaves either mode after the overlays it already closes,
 * focus stays on the deck, and an overlay always offers a visible way out.
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

/** A document with a scriptable Fullscreen API. */
function fakeDocument(options: { enabled?: boolean } = {}) {
  const target = new EventTarget();
  let current: Element | null = null;
  const fire = (type: 'fullscreenchange' | 'fullscreenerror') =>
    target.dispatchEvent(new Event(type));
  Object.defineProperty(target, 'fullscreenElement', { get: () => current });
  const doc = Object.assign(target, {
    fullscreenEnabled: options.enabled ?? true,
    documentElement: { requestFullscreen: () => Promise.resolve() },
    exitFullscreen: vi.fn(async () => {
      current = null;
      fire('fullscreenchange');
    }),
  });
  const element = {
    requestFullscreen: vi.fn(async () => {
      current = element as unknown as Element;
      fire('fullscreenchange');
    }),
    contains: (other: unknown) => other === element,
  };
  return {
    doc: doc as unknown as Document,
    element: element as unknown as Element,
    request: element.requestFullscreen,
    exit: doc.exitFullscreen,
    fire,
    /** The browser leaving full screen on its own (its Escape, a tab switch). */
    leave() {
      current = null;
      fire('fullscreenchange');
    },
  };
}

function controller(fake: ReturnType<typeof fakeDocument>) {
  const changes: (DeckFullscreenMode | null)[] = [];
  const fs = createDeckFullscreen({
    element: () => fake.element,
    onChange: (mode) => changes.push(mode),
    doc: fake.doc,
  });
  return { fs, changes };
}

describe('createDeckFullscreen', () => {
  it('follows the document, not the request promise', async () => {
    const fake = fakeDocument();
    // A request that resolves without the document entering full screen.
    fake.request.mockImplementationOnce(async () => undefined);
    const { fs, changes } = controller(fake);
    expect(fs.preferred).toBe('native');
    await fs.enter();
    expect(fs.mode).toBeNull();
    expect(changes).toEqual([]);

    await fs.enter();
    expect(fs.mode).toBe('native');
    // The browser's own Escape: only `fullscreenchange` says so.
    fake.leave();
    expect(fs.mode).toBeNull();
    expect(changes).toEqual(['native', null]);
    fs.destroy();
  });

  it('falls back to fill-the-window mode when the API is missing or refused', async () => {
    const missing = fakeDocument({ enabled: false });
    const a = controller(missing);
    expect(a.fs.preferred).toBe('window');
    await a.fs.enter();
    expect(a.fs.mode).toBe('window');
    expect(missing.request).not.toHaveBeenCalled();

    const refused = fakeDocument();
    refused.request.mockRejectedValueOnce(new TypeError('Permissions check failed'));
    const b = controller(refused);
    await b.fs.enter();
    expect(b.fs.mode).toBe('window');

    // Some engines report the refusal only through `fullscreenerror`.
    const errored = fakeDocument();
    errored.request.mockImplementationOnce(async () => {
      errored.fire('fullscreenerror');
    });
    const c = controller(errored);
    await c.fs.enter();
    expect(c.fs.mode).toBe('window');
    // An error nobody asked for (another element's request) changes nothing.
    await c.fs.exit();
    errored.fire('fullscreenerror');
    expect(c.fs.mode).toBeNull();
  });

  it('leaves either mode, and toggles', async () => {
    const fake = fakeDocument();
    const { fs } = controller(fake);
    await fs.toggle();
    expect(fs.mode).toBe('native');
    await fs.toggle();
    expect(fs.mode).toBeNull();
    expect(fake.exit).toHaveBeenCalledTimes(1);

    const missing = fakeDocument({ enabled: false });
    const w = controller(missing);
    await w.fs.toggle();
    expect(w.fs.mode).toBe('window');
    await w.fs.exit();
    expect(w.fs.mode).toBeNull();
    expect(missing.exit).not.toHaveBeenCalled();
  });

  it('survives an exit the browser already made', async () => {
    const fake = fakeDocument();
    const { fs } = controller(fake);
    await fs.enter();
    fake.exit.mockRejectedValueOnce(new TypeError('Document not active'));
    await expect(fs.exit()).resolves.toBeUndefined();
    expect(fs.mode).toBe('native');
    fs.destroy();
    // Destroyed: later document events are ignored.
    fake.leave();
    expect(fs.mode).toBe('native');
  });
});

function fixtureDeck(): Deck {
  return {
    style: { aspect: '16:9' },
    outline: { title: 'Demo deck', sections: [{ id: 'all', slideIds: ['intro', 'body'] }] },
    slides: [
      { id: 'intro', title: 'Intro', layout: 'title-hero', props: { title: 'Welcome' } },
      { id: 'body', title: 'Body', layout: 'title-hero', props: { title: 'Body' } },
    ],
  };
}

/** Stubs the Fullscreen API on happy-dom's document (it has none). */
function stubFullscreen() {
  let element: Element | null = null;
  const fire = () => document.dispatchEvent(new Event('fullscreenchange'));
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
  const request = vi.fn(async function (this: Element) {
    element = this;
    fire();
  });
  Object.defineProperty(Element.prototype, 'requestFullscreen', {
    configurable: true,
    value: request,
  });
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    configurable: true,
    value: request,
  });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: vi.fn(async () => {
      element = null;
      fire();
    }),
  });
  return {
    restore() {
      for (const key of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen']) {
        delete (document as unknown as Record<string, unknown>)[key];
      }
      delete (Element.prototype as unknown as Record<string, unknown>).requestFullscreen;
      delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
    },
  };
}

describe('DeckApp full screen', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    window.location.hash = '';
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.location.hash = '';
  });

  function mount() {
    const view = render(DeckApp, { props: { deck: fixtureDeck(), autofocus: true } });
    const app = view.container.querySelector('[data-py-deck-app]') as HTMLElement;
    app.focus();
    return { view, app };
  }

  it('fills the window where the API is missing, and Escape leaves it', async () => {
    const { view, app } = mount();
    // happy-dom has no Fullscreen API, like an iframe without allow="fullscreen".
    await fireEvent.keyDown(app, { key: 'f' });
    await waitFor(() => expect(app.dataset.fullscreenMode).toBe('window'));
    expect(app.dataset.fullscreen).toBe('true');
    expect(app.className).toContain('fixed');
    expect(view.container.querySelector('[data-py-deck-toolbar]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Leave full screen' })).toBeTruthy();
    expect(view.container.querySelector('[data-py-deck-fullscreen-mode-note]')).not.toBeNull();

    await fireEvent.keyDown(app, { key: 'Escape' });
    await waitFor(() => expect(app.dataset.fullscreen).toBeUndefined());
    expect(app.dataset.fullscreenMode).toBeUndefined();
    expect(app.className).not.toContain('fixed');
    expect(view.container.querySelector('[data-py-deck-toolbar]')).not.toBeNull();
  });

  it('Escape closes help first, then leaves full screen', async () => {
    const { app } = mount();
    await fireEvent.keyDown(app, { key: 'f' });
    await waitFor(() => expect(app.dataset.fullscreen).toBe('true'));
    await fireEvent.keyDown(app, { key: '?' });
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
    await fireEvent.keyDown(app, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull()
    );
    expect(app.dataset.fullscreen).toBe('true');
    await fireEvent.keyDown(app, { key: 'Escape' });
    await waitFor(() => expect(app.dataset.fullscreen).toBeUndefined());
  });

  it('the full screen button keeps the keyboard on the deck, in and out', async () => {
    const fs = stubFullscreen();
    try {
      const { app } = mount();
      const button = await screen.findByRole('button', { name: 'Full screen' });
      button.focus();
      await fireEvent.click(button);
      await waitFor(() => expect(app.dataset.fullscreenMode).toBe('native'));
      await waitFor(() => expect(document.activeElement).toBe(app));
      await fireEvent.keyDown(app, { key: 'ArrowRight' });
      await waitFor(() => expect(app.dataset.slideId).toBe('body'));

      // The overlay's way out.
      await fireEvent.click(screen.getByRole('button', { name: 'Leave full screen' }));
      await waitFor(() => expect(app.dataset.fullscreen).toBeUndefined());
      await waitFor(() => expect(document.activeElement).toBe(app));
    } finally {
      fs.restore();
    }
  });

  it('shows the overlay on entering and on pointer moves, and fades it when idle', async () => {
    vi.useFakeTimers();
    const { view, app } = mount();
    await fireEvent.keyDown(app, { key: 'f' });
    flushSync();
    const overlay = () =>
      view.container.querySelector('[data-py-deck-fullscreen-overlay]') as HTMLElement;
    expect(overlay().dataset.visible).toBe('true');
    expect(screen.getByText('1 / 2')).toBeTruthy();

    vi.advanceTimersByTime(FULLSCREEN_OVERLAY_IDLE_MS);
    flushSync();
    expect(overlay().dataset.visible).toBe('false');
    expect(overlay().inert).toBe(true);

    await fireEvent.pointerMove(app);
    flushSync();
    expect(overlay().dataset.visible).toBe('true');

    // Its own buttons navigate without leaving full screen.
    await fireEvent.click(screen.getByRole('button', { name: 'Next step or slide' }));
    flushSync();
    expect(app.dataset.slideId).toBe('body');
    expect(app.dataset.fullscreen).toBe('true');
  });

  it('never shows the overlay over a blackout', async () => {
    const { view, app } = mount();
    await fireEvent.keyDown(app, { key: 'f' });
    await fireEvent.keyDown(app, { key: 'b' });
    await waitFor(() => expect(app.dataset.blackout).toBe('true'));
    const overlay = view.container.querySelector(
      '[data-py-deck-fullscreen-overlay]'
    ) as HTMLElement;
    expect(overlay.dataset.visible).toBe('false');
  });
});

describe('the full screen tooltip names the mode', () => {
  afterEach(() => cleanup());

  it('says the deck fills the window where the browser cannot go full screen', async () => {
    render(DeckToolbar, {
      props: { reference: () => '', onaction: () => {}, fullscreenPreferred: 'window' },
    });
    const button = screen.getByRole('button', { name: 'Full screen' });
    button.focus();
    // happy-dom treats a programmatic focus as keyboard focus.
    await waitFor(() =>
      expect(screen.getByRole('tooltip').textContent).toContain(FULLSCREEN_WINDOW_DESCRIPTION)
    );
  });
});
