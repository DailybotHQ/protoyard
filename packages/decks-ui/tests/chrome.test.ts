import { DECK_KEY_BINDINGS } from '@protoyard/decks';
import type { Deck } from '@protoyard/decks/schema';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckApp } from '../src/app/index.ts';
import {
  cleanReferenceText,
  copyText,
  DeckToolbar,
  fullscreenAvailable,
  isFullscreen,
  onFullscreenChange,
  slideReference,
  toggleFullscreen,
} from '../src/chrome/index.ts';

vi.mock('../src/layouts/index.ts', async () => {
  const Mock = (await import('./fixtures/MockLayoutRenderer.svelte')).default;
  return { DeckLayoutRenderer: Mock };
});

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  private target: Element | undefined;
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }
  observe(target: Element) {
    this.target = target;
  }
  unobserve() {}
  disconnect() {
    this.target = undefined;
  }
  resize(width: number, height: number) {
    if (!this.target) return;
    this.callback(
      [{ target: this.target, contentRect: { width, height } } as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
}

const RLO = String.fromCodePoint(0x202e);
const ZWSP = String.fromCodePoint(0x200b);

function fixtureDeck(): Deck {
  return {
    style: { aspect: '16:9' },
    outline: { title: 'Demo deck', sections: [{ id: 'all', slideIds: ['intro', 'body'] }] },
    slides: [
      {
        id: 'intro',
        title: 'Intro',
        layout: 'title-hero',
        props: { title: 'Welcome' },
        steps: ['point-a', 'point-b'],
      },
      { id: 'body', layout: 'free', blocks: [{ type: 'heading', text: 'Body slide', level: 2 }] },
    ],
  };
}

/** Stub the Fullscreen API on happy-dom's document (it has none). */
function stubFullscreen() {
  let element: Element | null = null;
  const fire = () => document.dispatchEvent(new Event('fullscreenchange'));
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
  const request = vi.fn(async function (this: Element) {
    element = this;
    fire();
  });
  const exit = vi.fn(async () => {
    element = null;
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
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
  return {
    request,
    exit,
    restore() {
      delete (document as unknown as Record<string, unknown>).fullscreenEnabled;
      delete (document as unknown as Record<string, unknown>).fullscreenElement;
      delete (document as unknown as Record<string, unknown>).exitFullscreen;
      delete (Element.prototype as unknown as Record<string, unknown>).requestFullscreen;
      delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
    },
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
  ResizeObserverMock.instances = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (navigator as unknown as Record<string, unknown>).clipboard;
  window.location.hash = '';
});

describe('slideReference', () => {
  it('produces `<title> · <slide-id> · #/<id>/<step>` exactly', () => {
    expect(slideReference({ title: 'Intro', slideId: 'intro', step: 1 })).toBe(
      'Intro · intro · #/intro/1'
    );
    expect(slideReference({ title: 'Pricing  plans\n', slideId: 'pricing', step: 0 })).toBe(
      'Pricing plans · pricing · #/pricing/0'
    );
  });

  it('falls back to the slide id for an empty title and clamps the step through formatDeckHash', () => {
    expect(slideReference({ title: '', slideId: 'close', step: 2.7 })).toBe(
      'close · close · #/close/2'
    );
    expect(slideReference({ title: null, slideId: 'close', step: -4 })).toBe(
      'close · close · #/close/0'
    );
  });

  it('drops bidi and zero-width characters so a pasted reference reads as shown', () => {
    const title = `Q3${RLO}gnp.exe${ZWSP} plan`;
    const ref = slideReference({ title, slideId: 'q3', step: 0 });
    expect(ref).toBe('Q3 gnp.exe plan · q3 · #/q3/0');
    expect([...ref].some((c) => c === RLO || c === ZWSP)).toBe(false);
    expect(cleanReferenceText(`  a\t\tb${RLO} `)).toBe('a b');
  });
});

describe('copyText', () => {
  it('uses the async Clipboard API when it works', async () => {
    const writeText = stubClipboard(async () => {});
    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand when the Clipboard API refuses, and reports a failure honestly', async () => {
    stubClipboard(async () => {
      throw new Error('denied');
    });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: exec });
    await expect(copyText('fallback')).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();

    exec.mockReturnValue(false);
    await expect(copyText('nope')).resolves.toBe(false);
    delete (document as unknown as Record<string, unknown>).execCommand;
  });
});

describe('fullscreen helpers', () => {
  it('report availability, toggle and notify, and never throw without the API', async () => {
    const before = fullscreenAvailable();
    expect(before).toBe(false);
    const el = document.body.appendChild(document.createElement('div'));
    await expect(toggleFullscreen(el)).resolves.toBe(false);

    const fs = stubFullscreen();
    try {
      expect(fullscreenAvailable()).toBe(true);
      const changes = vi.fn();
      const stop = onFullscreenChange(changes);
      await expect(toggleFullscreen(el)).resolves.toBe(true);
      expect(isFullscreen(el)).toBe(true);
      await expect(toggleFullscreen(el)).resolves.toBe(false);
      expect(changes).toHaveBeenCalledTimes(2);
      stop();
      fs.request.mockRejectedValueOnce(new Error('refused'));
      await expect(toggleFullscreen(el)).resolves.toBe(false);
    } finally {
      fs.restore();
      el.remove();
    }
  });
});

describe('DeckToolbar', () => {
  const props = (extra: Record<string, unknown> = {}) => ({
    reference: () => 'Intro · intro · #/intro/0',
    slides: fixtureDeck().slides,
    currentOrdinal: 1,
    onjump: vi.fn(),
    onaction: vi.fn(),
    helpId: 'help-x',
    ...extra,
  });

  it('renders every tool as a named button and reports toggle state', () => {
    render(DeckToolbar, {
      props: props({ blackout: true, laser: false, fullscreen: true, help: true }),
    });
    const bar = screen.getByRole('toolbar', { name: 'Deck controls' });
    const names = within(bar)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual([
      'Previous step or slide',
      // The visible count is part of the name (WCAG 2.5.3, label in name).
      'Choose a slide, 1 / 2',
      'Next step or slide',
      'First slide',
      'Last slide',
      'Overview of all slides',
      'Full screen',
      'Presenter view',
      'Black out the screen',
      'Laser pointer',
      'Copy link to this slide',
      'Print, one slide per page',
      'Controls and shortcuts',
    ]);
    for (const button of within(bar).getAllByRole('button')) {
      expect(button.getAttribute('type')).toBe('button');
    }
    expect(
      screen.getByRole('button', { name: 'Black out the screen' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.getByRole('button', { name: 'Laser pointer' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
    expect(screen.getByRole('button', { name: 'Full screen' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    const help = screen.getByRole('button', { name: 'Controls and shortcuts' });
    expect(help.getAttribute('aria-expanded')).toBe('true');
    expect(help.getAttribute('aria-controls')).toBe('help-x');
  });

  it('sends each toggle to the deck', async () => {
    const onaction = vi.fn();
    render(DeckToolbar, { props: props({ onaction }) });
    for (const [name, action] of [
      ['Black out the screen', 'blackout'],
      ['Full screen', 'fullscreen'],
      ['Laser pointer', 'laser'],
      ['Controls and shortcuts', 'help'],
    ] as const) {
      await fireEvent.click(screen.getByRole('button', { name }));
      expect(onaction).toHaveBeenLastCalledWith(action);
    }
    expect(onaction).toHaveBeenCalledTimes(4);
  });

  it('hides full screen where the browser cannot do it (no dead control)', () => {
    render(DeckToolbar, {
      props: props({
        environment: {
          fullscreen: false,
          popup: false,
          clipboard: true,
          print: true,
          debug: false,
        },
      }),
    });
    expect(screen.queryByRole('button', { name: 'Full screen' })).toBeNull();
  });

  it('copies the link and announces success or failure', async () => {
    const writeText = stubClipboard(async () => {});
    render(DeckToolbar, { props: props() });
    await fireEvent.click(screen.getByRole('button', { name: 'Copy link to this slide' }));
    expect(writeText).toHaveBeenCalledWith('Intro · intro · #/intro/0');
    const status = screen.getByRole('status');
    await waitFor(() => expect(status.textContent?.trim()).toBe('Link copied'));

    writeText.mockRejectedValueOnce(new Error('denied'));
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false });
    await fireEvent.click(screen.getByRole('button', { name: 'Copy link to this slide' }));
    await waitFor(() => expect(status.textContent?.trim()).toBe('Could not copy the link'));
    delete (document as unknown as Record<string, unknown>).execCommand;
  });
});

describe('the tools inside DeckApp', () => {
  function mount() {
    const view = render(DeckApp, { props: { deck: fixtureDeck(), autofocus: true } });
    ResizeObserverMock.instances[0]?.resize(1280, 720);
    const app = view.container.querySelector('[data-py-deck-app]') as HTMLElement;
    app.focus();
    return { view, app };
  }

  it('B and . black out the screen; the black screen is a button that brings the slide back', async () => {
    const { app } = mount();
    await fireEvent.keyDown(app, { key: 'b' });
    const black = await screen.findByRole('button', { name: /Screen blacked out/ });
    expect(app.dataset.blackout).toBe('true');
    // A click on the black screen never advances the deck.
    await fireEvent.click(black);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Screen blacked out/ })).toBeNull()
    );
    expect(app.dataset.slideStep).toBe('0');
    await fireEvent.keyDown(app, { key: '.' });
    expect(await screen.findByRole('button', { name: /Screen blacked out/ })).toBeTruthy();
    await fireEvent.keyDown(app, { key: 'Escape' });
    await waitFor(() => expect(app.dataset.blackout).toBeUndefined());
  });

  it('L toggles a laser dot that follows the pointer and leaves with it', async () => {
    const { app, view } = mount();
    app.getBoundingClientRect = () => ({ left: 10, top: 20, width: 800, height: 450 }) as DOMRect;
    await fireEvent.keyDown(app, { key: 'l' });
    await waitFor(() => expect(app.dataset.laser).toBe('true'));
    const layer = view.container.querySelector('[data-py-deck-laser]');
    expect(layer?.getAttribute('aria-hidden')).toBe('true');
    await fireEvent.pointerMove(app, { clientX: 110, clientY: 220 });
    const dot = view.container.querySelector<HTMLElement>('[data-py-deck-laser-dot]');
    expect(dot?.style.left).toBe('100px');
    expect(dot?.style.top).toBe('200px');
    await fireEvent.pointerLeave(app);
    await waitFor(() =>
      expect(view.container.querySelector('[data-py-deck-laser-dot]')).toBeNull()
    );
    await fireEvent.keyDown(app, { key: 'l' });
    await waitFor(() => expect(view.container.querySelector('[data-py-deck-laser]')).toBeNull());
  });

  it('? opens the keyboard help from the real bindings, focused on Close; Close and Escape shut it', async () => {
    // Every bound control is available once the host can print (happy-dom has no window.print).
    vi.stubGlobal('print', () => {});
    const { app } = mount();
    await fireEvent.keyDown(app, { key: '?', shiftKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Controls and shortcuts' });
    for (const binding of DECK_KEY_BINDINGS) expect(dialog.textContent).toContain(binding.label);
    await waitFor(() => expect(document.activeElement?.textContent?.trim()).toBe('Close'));
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Controls and shortcuts' })).toBeNull()
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Controls and shortcuts' }));
    expect(await screen.findByRole('dialog', { name: 'Controls and shortcuts' })).toBeTruthy();
    await fireEvent.keyDown(app, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Controls and shortcuts' })).toBeNull()
    );
  });

  it('F enters full screen on the deck root and hides every piece of chrome; F leaves', async () => {
    const fs = stubFullscreen();
    try {
      const { app, view } = mount();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Full screen' })).toBeTruthy());
      await fireEvent.keyDown(app, { key: 'f' });
      await waitFor(() => expect(app.dataset.fullscreen).toBe('true'));
      expect(fs.request.mock.contexts[0]).toBe(app);
      expect(view.container.querySelector('[data-py-deck-chrome-root]')).toBeNull();
      expect(view.container.querySelector('[data-py-deck-toolbar]')).toBeNull();
      expect(view.container.querySelector('[data-py-deck-progress]')).toBeNull();
      await fireEvent.keyDown(app, { key: 'f' });
      await waitFor(() => expect(app.dataset.fullscreen).toBeUndefined());
      expect(view.container.querySelector('[data-py-deck-toolbar]')).not.toBeNull();
    } finally {
      fs.restore();
    }
  });

  it('copies a plain link to the current slide and step', async () => {
    const writeText = stubClipboard(async () => {});
    const { app } = mount();
    const page = window.location.href.split('#')[0];
    await fireEvent.keyDown(app, { key: 'ArrowRight' });
    await waitFor(() => expect(app.dataset.slideStep).toBe('1'));
    await fireEvent.click(screen.getByRole('button', { name: 'Copy link to this slide' }));
    expect(writeText).toHaveBeenCalledWith(`${page}#/intro/1`);
    // A toolbar click never advances the deck.
    expect(app.dataset.slideStep).toBe('1');

    await fireEvent.keyDown(app, { key: 'ArrowRight' });
    await fireEvent.keyDown(app, { key: 'ArrowRight' });
    await waitFor(() => expect(app.dataset.slideId).toBe('body'));
    await fireEvent.click(screen.getByRole('button', { name: 'Copy link to this slide' }));
    expect(writeText).toHaveBeenLastCalledWith(`${page}#/body/0`);
  });

  it('toolbar buttons toggle the same state as the keys', async () => {
    const { app } = mount();
    await fireEvent.click(screen.getByRole('button', { name: 'Laser pointer' }));
    await waitFor(() => expect(app.dataset.laser).toBe('true'));
    expect(screen.getByRole('button', { name: 'Laser pointer' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Laser pointer' }));
    await waitFor(() => expect(app.dataset.laser).toBeUndefined());
    await fireEvent.click(screen.getByRole('button', { name: 'Black out the screen' }));
    await waitFor(() => expect(app.dataset.blackout).toBe('true'));
  });
});
