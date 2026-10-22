import {
  availableDeckControls,
  DEFAULT_DECK_CONTROL_ENVIRONMENT,
  type DeckControlEnvironment,
} from '@protoyard/decks';
import type { Deck } from '@protoyard/decks/schema';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckApp } from '../src/app/index.ts';
import {
  claimFirstRunHint,
  FIRST_RUN_HINT_MS,
  FirstRunHint,
  firstRunHintAllowed,
  firstRunHintKey,
  KeyboardHelp,
} from '../src/chrome/index.ts';

/**
 * Help and onboarding (T-help-and-onboarding, AC-help-guide): the "?" dialog
 * is a controls guide built from the registry, and a first-visit hint shows
 * once per deck namespace, can be turned off, and survives storage that throws.
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

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

const throwing = (): Storage => {
  throw new DOMException('denied', 'SecurityError');
};

/** happy-dom reports `navigator.webdriver`; a real visitor's browser does not. */
function setWebdriver(value: boolean) {
  Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => value });
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  window.history.replaceState(null, '', '/');
  setWebdriver(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  delete (navigator as unknown as Record<string, unknown>).webdriver;
});

describe('Controls and shortcuts', () => {
  const full: DeckControlEnvironment = {
    fullscreen: true,
    popup: true,
    clipboard: true,
    print: true,
    debug: true,
  };

  it('lists every available control once, with icon, description and keys', () => {
    const { container } = render(KeyboardHelp, { props: { onclose: () => {}, environment: full } });
    const dialog = screen.getByRole('dialog', { name: 'Controls and shortcuts' });
    const items = [...container.querySelectorAll<HTMLElement>('[data-py-deck-help-control]')];
    const expected = availableDeckControls(full);
    expect(items.map((item) => item.dataset.pyDeckHelpControl)).toEqual(expected.map((c) => c.id));
    for (const control of expected) {
      const item = dialog.querySelector(
        `[data-py-deck-help-control="${control.id}"]`
      ) as HTMLElement;
      expect(item.querySelector('svg')).not.toBeNull();
      expect(item.textContent).toContain(control.label);
      expect(item.textContent).toContain(control.description);
      for (const key of control.keys) {
        expect(within(item).getAllByText(key.label, { selector: 'kbd' }).length).toBeGreaterThan(0);
      }
      if (control.keys.length === 0) expect(item.textContent).toContain('Button only');
    }
    // Buttons without a key are explained too.
    expect(dialog.textContent).toMatch(/copy/i);
  });

  it('leaves out controls this host cannot offer', () => {
    const { container } = render(KeyboardHelp, {
      props: {
        onclose: () => {},
        environment: { ...DEFAULT_DECK_CONTROL_ENVIRONMENT, clipboard: false, print: false },
      },
    });
    const ids = [...container.querySelectorAll<HTMLElement>('[data-py-deck-help-control]')].map(
      (item) => item.dataset.pyDeckHelpControl
    );
    expect(ids).not.toContain('copy-link');
    expect(ids).not.toContain('print');
    expect(ids).toContain('presenter');
    expect(ids).not.toContain('debug');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('focuses Close on open and returns focus to the opener on close', async () => {
    const opener = document.body.appendChild(document.createElement('button'));
    opener.focus();
    const view = render(KeyboardHelp, { props: { onclose: () => {} } });
    await waitFor(() => expect(document.activeElement?.textContent?.trim()).toBe('Close'));
    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe('first-visit hint rules', () => {
  it('claims the hint once per namespace', () => {
    const store = new MemoryStorage();
    expect(claimFirstRunHint('deck-a', () => store)).toBe(true);
    expect(claimFirstRunHint('deck-a', () => store)).toBe(false);
    expect(claimFirstRunHint('deck-b', () => store)).toBe(true);
    expect(store.getItem(firstRunHintKey('deck-a'))).toBe('1');
  });

  it('survives storage that throws or is missing', () => {
    expect(claimFirstRunHint('deck-a', throwing)).toBe(true);
    const store = new MemoryStorage();
    store.getItem = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    expect(claimFirstRunHint('deck-a', () => store)).toBe(true);
    expect(claimFirstRunHint('deck-a', () => null)).toBe(true);
  });

  it('honours ?hint=0 and stays off under automation unless ?hint=1', () => {
    expect(firstRunHintAllowed()).toBe(true);
    window.history.replaceState(null, '', '/?hint=0');
    expect(firstRunHintAllowed()).toBe(false);
    window.history.replaceState(null, '', '/');
    setWebdriver(true);
    expect(firstRunHintAllowed()).toBe(false);
    window.history.replaceState(null, '', '/?hint=1');
    expect(firstRunHintAllowed()).toBe(true);
  });
});

describe('FirstRunHint', () => {
  const hint = () => document.querySelector('[data-py-deck-hint]');

  it('shows the keys from the registry, then leaves after 6 s', async () => {
    vi.useFakeTimers();
    const store = new MemoryStorage();
    render(FirstRunHint, {
      props: { namespace: 'deck-a', container: document.body, storage: () => store },
    });
    flushSync();
    expect(hint()?.textContent?.replace(/\s+/g, ' ')).toContain(
      'Use ← → to move, F for full screen, ? for every control.'
    );
    vi.advanceTimersByTime(FIRST_RUN_HINT_MS);
    flushSync();
    expect(hint()).toBeNull();
  });

  it('leaves on the first key or pointer input, or on Got it', async () => {
    const container = document.body.appendChild(document.createElement('div'));
    const mountHint = (namespace: string) =>
      render(FirstRunHint, {
        props: { namespace, container, storage: () => new MemoryStorage() },
      });

    mountHint('a');
    expect(hint()).not.toBeNull();
    await fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(hint()).toBeNull();
    cleanup();

    mountHint('b');
    await fireEvent.pointerDown(container);
    expect(hint()).toBeNull();
    cleanup();

    mountHint('c');
    await fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(hint()).toBeNull();
    container.remove();
  });

  it('never shows twice for one namespace, nor with ?hint=0', () => {
    const store = new MemoryStorage();
    const props = { namespace: 'deck-a', container: document.body, storage: () => store };
    render(FirstRunHint, { props });
    expect(hint()).not.toBeNull();
    cleanup();
    render(FirstRunHint, { props });
    expect(hint()).toBeNull();
    cleanup();

    window.history.replaceState(null, '', '/?hint=0');
    render(FirstRunHint, { props: { ...props, storage: () => new MemoryStorage() } });
    expect(hint()).toBeNull();
  });
});

describe('inside DeckApp', () => {
  function deck(): Deck {
    return {
      style: { aspect: '16:9' },
      slides: [{ id: 'intro', layout: 'title-hero', props: { title: 'Welcome' } }],
    };
  }

  it('shows the hint on the first visit only, and the guide from the toolbar', async () => {
    const first = render(DeckApp, { props: { deck: deck(), namespace: 'help-test' } });
    expect(hint()).not.toBeNull();
    expect(localStorage.getItem(firstRunHintKey('help-test'))).toBe('1');
    // A click on the hint never advances the deck.
    expect(hint()?.hasAttribute('data-py-deck-chrome')).toBe(true);

    await fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    const dialog = await screen.findByRole('dialog', { name: 'Controls and shortcuts' });
    expect(within(dialog).getByText('Copy slide reference')).toBeTruthy();
    first.unmount();

    render(DeckApp, { props: { deck: deck(), namespace: 'help-test' } });
    expect(hint()).toBeNull();
  });

  const hint = () => document.querySelector('[data-py-deck-hint]');
});
