import type { Deck } from '@protoyard/decks/schema';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckApp } from '../src/app/index.ts';

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

function fixtureDeck(): Deck {
  return {
    style: { aspect: '16:9' },
    outline: {
      title: 'Demo deck',
      sections: [{ id: 'all', slideIds: ['intro', 'body', 'close'] }],
    },
    slides: [
      {
        id: 'intro',
        title: 'Intro',
        layout: 'title-hero',
        props: { title: 'Welcome', subtitle: 'A short talk' },
        steps: ['point-a', 'point-b'],
      },
      {
        id: 'body',
        title: 'Body',
        layout: 'free',
        blocks: [
          { type: 'heading', text: 'Body slide', level: 2 },
          { type: 'text', markdown: 'Details go here.' },
        ],
      },
      {
        id: 'close',
        title: 'Close',
        layout: 'closing-cta',
        props: {
          title: 'Thanks',
          cta: { label: 'Docs', href: 'https://example.com/docs' },
        },
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  ResizeObserverMock.instances = [];
  vi.unstubAllGlobals();
  if (typeof window !== 'undefined') {
    window.location.hash = '';
  }
});

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  if (typeof window !== 'undefined') window.location.hash = '';
});

function mount(deck: Deck = fixtureDeck(), props: Record<string, unknown> = {}) {
  const view = render(DeckApp, { props: { deck, autofocus: true, ...props } });
  const observer = ResizeObserverMock.instances[0];
  observer?.resize(1280, 720);
  return view;
}

describe('DeckApp', () => {
  it('renders the canvas, chrome and aria-live region', async () => {
    const view = mount();
    const app = view.container.querySelector('[data-py-deck-app]');
    expect(app).toBeTruthy();
    expect(app?.getAttribute('role')).toBe('application');
    expect(app?.getAttribute('aria-label')).toBe('Demo deck');
    expect(view.container.querySelector('[data-testid="deck-canvas"]')).toBeTruthy();
    expect(view.container.querySelector('[data-py-deck-progress]')).toBeTruthy();
    expect(view.container.querySelector('[data-py-deck-slide-number]')?.textContent).toMatch(
      /Slide 1 of 3/
    );
    const live = view.container.querySelector('[data-py-deck-live]');
    expect(live?.getAttribute('aria-live')).toBe('polite');
    await waitFor(() => expect(live?.textContent).toMatch(/Slide 1 of 3/));
  });

  it('advances steps then slides with keyboard and announces progress', async () => {
    const view = mount();
    const app = view.container.querySelector('[data-py-deck-app]') as HTMLElement;
    app.focus();

    // intro has 2 steps → first next stays on intro step 1
    await fireEvent.keyDown(app, { key: 'ArrowRight' });
    await waitFor(() => expect(app.getAttribute('data-slide-id')).toBe('intro'));
    expect(app.getAttribute('data-slide-step')).toBe('1');

    // second next moves to body
    await fireEvent.keyDown(app, { key: 'ArrowRight' });
    await waitFor(() => expect(app.getAttribute('data-slide-id')).toBe('body'));
    expect(app.getAttribute('data-slide-step')).toBe('0');

    const live = view.container.querySelector('[data-py-deck-live]');
    await waitFor(() => expect(live?.textContent).toMatch(/Slide 2 of 3/));
    expect(view.container.querySelector('[data-py-deck-slide-number]')?.textContent).toMatch(
      /Slide 2 of 3/
    );

    // slides expose aria-roledescription via DeckCanvas
    const groups = view.container.querySelectorAll('[aria-roledescription="slide"]');
    expect(groups.length).toBeGreaterThan(0);
  });

  it('goes previous with ArrowLeft and jumps with Home/End', async () => {
    const view = mount();
    const app = view.container.querySelector('[data-py-deck-app]') as HTMLElement;
    app.focus();

    await fireEvent.keyDown(app, { key: 'End' });
    await waitFor(() => expect(app.getAttribute('data-slide-id')).toBe('close'));

    await fireEvent.keyDown(app, { key: 'Home' });
    await waitFor(() => expect(app.getAttribute('data-slide-id')).toBe('intro'));
    expect(app.getAttribute('data-slide-step')).toBe('0');

    await fireEvent.keyDown(app, { key: 'ArrowRight' });
    await fireEvent.keyDown(app, { key: 'ArrowRight' });
    await waitFor(() => expect(app.getAttribute('data-slide-id')).toBe('body'));

    await fireEvent.keyDown(app, { key: 'ArrowLeft' });
    await waitFor(() => {
      expect(app.getAttribute('data-slide-id')).toBe('intro');
      expect(app.getAttribute('data-slide-step')).toBe('1');
    });
  });

  it('advances on guarded click of the canvas background', async () => {
    const view = mount();
    const app = view.container.querySelector('[data-py-deck-app]') as HTMLElement;
    const canvas = view.container.querySelector('[data-testid="deck-canvas"]') as HTMLElement;
    await fireEvent.click(canvas);
    await waitFor(() => expect(app.getAttribute('data-slide-step')).toBe('1'));
  });

  it('syncs the hash adapter and responds to hash changes', async () => {
    const view = mount();
    const app = view.container.querySelector('[data-py-deck-app]') as HTMLElement;

    await fireEvent.keyDown(app, { key: 'End' });
    await waitFor(() => expect(window.location.hash).toMatch(/#\/close\/0/));

    window.location.hash = '#/body/0';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => expect(app.getAttribute('data-slide-id')).toBe('body'));
  });

  it('toggles blackout and overview overlays', async () => {
    const view = mount();
    const app = view.container.querySelector('[data-py-deck-app]') as HTMLElement;

    await fireEvent.keyDown(app, { key: 'b' });
    await waitFor(() =>
      expect(view.container.querySelector('[data-py-deck-blackout]')).toBeTruthy()
    );
    expect(app.getAttribute('data-blackout')).toBe('true');

    await fireEvent.keyDown(app, { key: 'Escape' });
    await waitFor(() => expect(view.container.querySelector('[data-py-deck-blackout]')).toBeNull());

    await fireEvent.keyDown(app, { key: 'o' });
    await waitFor(() =>
      expect(view.container.querySelector('[data-py-deck-overview]')).toBeTruthy()
    );
    const item = view.container.querySelector(
      '[data-py-deck-overview-item="body"]'
    ) as HTMLButtonElement;
    await fireEvent.click(item);
    await waitFor(() => expect(app.getAttribute('data-slide-id')).toBe('body'));
  });
});
