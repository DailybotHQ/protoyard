import type { Deck } from '@protoyard/decks/schema';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DeckApp } from '../src/app/index.ts';

/**
 * DeckApp on the `@texuli/slides` stage. The stage's own behavior (keys,
 * chrome, overview, presenter, print, fit) is covered by Texuli's stage
 * tests; these check the Protoyard host: the deck shape migrates and paints,
 * the host location attributes follow the stage, Protoyard free slides paint
 * through `@protoyard/blocks-ui`, and the hash routes.
 */
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

beforeAll(async () => {
  // The text family is a lazy chunk: load it once so the free slide paints at once.
  await import('../../blocks-ui/src/text/index.ts');
}, 60_000);

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

beforeEach(() => {
  window.location.hash = '';
});

function mount(deck: Deck = fixtureDeck(), props: Record<string, unknown> = {}) {
  const view = render(DeckApp, { props: { deck, autofocus: true, ...props } });
  const app = () => view.container.querySelector('[data-py-deck-app]') as HTMLElement;
  const stage = () => view.container.querySelector('.tx-deck-stage') as HTMLElement;
  return { view, app, stage };
}

describe('DeckApp on the Texuli stage', () => {
  it('presents a Protoyard deck on the stage, named by its outline title', async () => {
    const { view, app, stage } = mount();
    expect(app()).toBeTruthy();
    await waitFor(() => expect(stage()).toBeTruthy());
    expect(stage().getAttribute('data-tx-deck-invalid')).toBeNull();
    expect(stage().getAttribute('aria-label')).toMatch(/Demo deck/);
    await waitFor(() =>
      expect(view.container.querySelector('[data-tx-deck-slide="intro"]')).toBeTruthy()
    );
    const slide = view.container.querySelector('[data-tx-deck-slide="intro"]');
    expect(slide?.getAttribute('aria-roledescription')).toBe('slide');
    expect(app().getAttribute('data-slide-id')).toBe('intro');
    expect(app().getAttribute('data-slide-step')).toBe('0');
  });

  it('paints on the first render: the stage never waits for its lazy defaults', () => {
    // DeckApp brings its own free renderer and block check with defaultRenderers={false}, and hands
    // the stage a v2 deck, so the stage never waits for its lazy defaults, the built-in block chunk
    // (Texuli G46) or the migration chunk: it validates and mounts the slides on the first render.
    // (A slide's own layout renderer is a lazy chunk and may show its status inside the slide.)
    const { view, stage } = mount();
    expect(stage()).toBeTruthy();
    expect(stage().getAttribute('aria-busy')).toBeNull();
    expect(stage().querySelector(':scope > .tx-deck-stage__loading')).toBeNull();
    expect(view.container.querySelector('[data-tx-deck-slide="intro"]')).toBeTruthy();
  });

  it('follows steps, then slides, with the keyboard; the host attributes follow the stage', async () => {
    const { app, stage } = mount();
    await waitFor(() => expect(stage()).toBeTruthy());
    // intro has 2 labelled steps → positions 0, 1, 2; the first two nexts stay on intro
    await fireEvent.keyDown(stage(), { key: 'ArrowRight' });
    await waitFor(() => expect(app().getAttribute('data-slide-step')).toBe('1'));
    expect(app().getAttribute('data-slide-id')).toBe('intro');
    await fireEvent.keyDown(stage(), { key: 'ArrowRight' });
    await waitFor(() => expect(app().getAttribute('data-slide-step')).toBe('2'));
    await fireEvent.keyDown(stage(), { key: 'ArrowRight' });
    await waitFor(() => expect(app().getAttribute('data-slide-id')).toBe('body'));
    expect(app().getAttribute('data-slide-step')).toBe('0');

    await fireEvent.keyDown(stage(), { key: 'End' });
    await waitFor(() => expect(app().getAttribute('data-slide-id')).toBe('close'));
    await fireEvent.keyDown(stage(), { key: 'Home' });
    await waitFor(() => expect(app().getAttribute('data-slide-id')).toBe('intro'));
  });

  it('paints a free slide through @protoyard/blocks-ui with its heading promoted', async () => {
    window.location.hash = '#/body/0';
    const { view } = mount();
    await waitFor(() =>
      expect(view.container.querySelector('[data-py-deck-free="body"]')).toBeTruthy()
    );
    const free = view.container.querySelector('[data-py-deck-free="body"]') as HTMLElement;
    expect(free.querySelector('[data-slot="title"]')?.textContent).toBe('Body slide');
    await waitFor(() => expect(free.textContent).toContain('Details go here.'));
    expect(free.querySelector('[data-tx-deck-item="1"]')).toBeTruthy();
  });

  it('keeps #/<slide>/<step> in the URL and follows hash changes', async () => {
    const { app, stage } = mount();
    await waitFor(() => expect(stage()).toBeTruthy());
    await fireEvent.keyDown(stage(), { key: 'End' });
    await waitFor(() => expect(window.location.hash).toMatch(/#\/close\/0/));

    window.location.hash = '#/body/0';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => expect(app().getAttribute('data-slide-id')).toBe('body'));
  });

  it('leaves the hash alone when syncHash is off', async () => {
    const { stage, app } = mount(fixtureDeck(), { syncHash: false });
    await waitFor(() => expect(stage()).toBeTruthy());
    await fireEvent.keyDown(stage(), { key: 'End' });
    await waitFor(() => expect(app().getAttribute('data-slide-id')).toBe('close'));
    expect(window.location.hash).toBe('');
  });

  it('asks the stage for the Protoyard theme key: a theme id, a palette seed or the default', async () => {
    const themed = mount({ ...fixtureDeck(), style: { theme: 'ocean' } });
    expect(themed.app().getAttribute('data-py-deck-theme')).toBe('ocean');
    cleanup();
    const seeded = mount({ ...fixtureDeck(), style: { paletteSeed: 0x12ab34 } });
    expect(seeded.app().getAttribute('data-py-deck-theme')).toBe('seed-0012ab34');
    await waitFor(() => expect(seeded.stage()).toBeTruthy());
    expect(seeded.stage().getAttribute('data-tx-deck-invalid')).toBeNull();
    cleanup();
    const plain = mount();
    expect(plain.app().getAttribute('data-py-deck-theme')).toBe('violet');
  });
});
