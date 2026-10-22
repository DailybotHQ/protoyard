import type { Deck } from '@protoyard/decks/schema';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckApp } from '../src/app/index.ts';
import type { CustomSlideRegistry } from '../src/layouts/custom-slides.ts';
import { customSlideLoader, frozenCopy } from '../src/layouts/custom-slides.ts';
import DeckLayoutRenderer from '../src/layouts/DeckLayoutRenderer.svelte';

/**
 * Owned custom slides (T-custom-slides, AC-custom-slides-unit): a
 * `layout: "custom"` slide renders the component a generated deck registers,
 * lazily, with its step props; errors stay on that slide; the player and
 * previews show labelled cards and run no owned code.
 */

/** Reports a 1280 x 720 box at once, so the canvas measures and shows its slides. */
class ResizeObserverMock {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: 1280, height: 720 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

function deck(
  customProps: Record<string, unknown>,
  extra: Partial<Deck['slides'][number]> = {}
): Deck {
  return {
    style: { aspect: '16:9' },
    slides: [
      { id: 'intro', layout: 'title-hero', props: { title: 'Welcome' } },
      { id: 'middle', layout: 'title-hero', props: { title: 'Middle' } },
      { id: 'later', layout: 'title-hero', props: { title: 'Later' } },
      {
        id: 'live',
        title: 'Live slide',
        layout: 'custom',
        props: customProps,
        ...extra,
      } as Deck['slides'][number],
      { id: 'after', layout: 'title-hero', props: { title: 'After' } },
    ],
  };
}

const probe = () => import('./fixtures/CustomProbe.svelte');
const throwing = () => import('./fixtures/ThrowingSlide.svelte');

function mount(d: Deck, customSlides?: CustomSlideRegistry) {
  const view = render(DeckApp, {
    props: { deck: d, autofocus: true, ...(customSlides ? { customSlides } : {}) },
  });
  const app = view.container.querySelector('[data-py-deck-app]') as HTMLElement;
  app.focus();
  return { view, app };
}

async function goTo(app: HTMLElement, id: string) {
  window.location.hash = `#/${id}/0`;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await waitFor(() => expect(app.dataset.slideId).toBe(id));
}

describe('the registry', () => {
  it('looks up own entries only', () => {
    const registry: CustomSlideRegistry = { probe };
    expect(customSlideLoader(registry, 'probe')).toBe(probe);
    expect(customSlideLoader(registry, 'missing')).toBeNull();
    expect(customSlideLoader(registry, 'constructor')).toBeNull();
    expect(customSlideLoader(registry, 'toString')).toBeNull();
    expect(customSlideLoader(undefined, 'probe')).toBeNull();
  });

  it('hands components a deep-frozen copy of their data', () => {
    const data = { plan: { seats: 3 }, tags: ['a'] };
    const copy = frozenCopy(data);
    expect(copy).toEqual(data);
    expect(copy).not.toBe(data);
    expect(Object.isFrozen(copy.plan)).toBe(true);
    expect(Object.isFrozen(copy.tags)).toBe(true);
  });
});

describe('a custom slide in a generated deck', () => {
  it('loads its component lazily, only when the slide is near', async () => {
    const loader = vi.fn(probe);
    const { app } = mount(deck({ component: 'probe' }), { probe: loader });
    expect(loader).not.toHaveBeenCalled();
    await goTo(app, 'live');
    await waitFor(() => expect(document.querySelector('[data-probe]')).not.toBeNull());
    expect(loader).toHaveBeenCalled();
  });

  it('passes its own slide, step, step count and data, never the deck', async () => {
    const { app } = mount(
      deck({ component: 'probe', data: { seats: 12, plan: 'team' } }, { steps: ['one', 'two'] }),
      { probe }
    );
    await goTo(app, 'live');
    await waitFor(() =>
      expect(document.querySelector('[data-probe-step]')?.textContent).toBe('0/2')
    );
    expect(document.querySelector('[data-probe-slide]')?.textContent).toBe('live');
    expect(JSON.parse(document.querySelector('[data-probe-data]')?.textContent ?? '')).toEqual({
      seats: 12,
      plan: 'team',
    });
    // Only the slide's own fields: no `slides`, `style` or `outline`.
    expect(document.querySelector('[data-probe-keys]')?.textContent).toBe(
      'id,layout,props,steps,title'
    );

    await fireEvent.keyDown(app, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(document.querySelector('[data-probe-step]')?.textContent).toBe('1/2')
    );
    await fireEvent.keyDown(app, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(document.querySelector('[data-probe-step]')?.textContent).toBe('2/2')
    );
    await fireEvent.keyDown(app, { key: 'ArrowRight' });
    await waitFor(() => expect(app.dataset.slideId).toBe('after'));
  });

  it('owns its clicks: a button keeps its state and a click on the slide never advances', async () => {
    const { app } = mount(deck({ component: 'probe' }), { probe });
    await goTo(app, 'live');
    const button = await screen.findByRole('button', { name: 'Add one' });
    await fireEvent.click(button);
    await fireEvent.click(document.querySelector('[data-probe-surface]') as HTMLElement);
    expect(document.querySelector('[data-probe-clicks]')?.textContent).toBe('1');
    expect(app.dataset.slideId).toBe('live');
  });

  it('shows an error card for an unknown component id', async () => {
    const { app } = mount(deck({ component: 'nowhere' }), { probe });
    await goTo(app, 'live');
    const card = await screen.findByRole('alert');
    expect(card.textContent).toContain('This custom slide is not available');
    expect(card.textContent).toContain('"nowhere"');
  });

  it('keeps a component that throws on its own slide; the deck keeps navigating', async () => {
    const { app } = mount(deck({ component: 'boom', data: { fail: true } }), { boom: throwing });
    await goTo(app, 'live');
    await waitFor(() =>
      expect(document.querySelector('[data-py-deck-slide="live"]')?.textContent).toContain(
        'This slide stopped working'
      )
    );
    await fireEvent.keyDown(app, { key: 'ArrowRight' });
    await waitFor(() => expect(app.dataset.slideId).toBe('after'));
  });

  it('says so when its component fails to load', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('chunk missing')));
    const { app } = mount(deck({ component: 'gone' }), { gone: failing });
    await goTo(app, 'live');
    await waitFor(() =>
      expect(document.querySelector('[data-py-deck-slide="live"]')?.textContent).toContain(
        'This slide could not be loaded'
      )
    );
  });
});

describe('without owned code', () => {
  it('the player shows a labelled placeholder and loads nothing', async () => {
    const { app } = mount(deck({ component: 'probe' }));
    await goTo(app, 'live');
    const note = await waitFor(() => {
      const node = document.querySelector('[data-py-deck-slide="live"] [role="note"]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(note.textContent).toContain('Interactive slide — open the generated deck to run it');
    expect(note.textContent).toContain('Live slide');
  });

  it('thumbnails, print and previews show a card and never run the component', () => {
    const { container } = render(DeckLayoutRenderer, {
      props: { layout: 'custom' as never, props: { component: 'probe' } },
    });
    expect(container.textContent).toContain('Interactive slide');
    expect(container.querySelector('[data-probe]')).toBeNull();
  });
});
