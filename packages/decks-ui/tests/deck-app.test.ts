import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DECK_LAYOUTS, loadUntrustedDeck } from '@protoyard/decks';
import { type Deck, type FreeSlide } from '@protoyard/decks/schema';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { deckValidationHooks, prepareDeck } from '@texuli/slides/stage';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckApp } from '../src/app/index.ts';
import { createProtoyardRenderers } from '../src/app/renderers.ts';
import { stageDeck } from '../src/app/stage-deck.ts';

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

  it('keeps #/<slide>/<step> in the URL and follows hash changes', async () => {
    const { app, stage } = mount();
    await waitFor(() => expect(stage()).toBeTruthy());
    await fireEvent.keyDown(stage(), { key: 'End' });
    await waitFor(() => expect(window.location.hash).toMatch(/#\/close\/0/));

    window.location.hash = '#/body/0';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => expect(app().getAttribute('data-slide-id')).toBe('body'));
  });
});

// --- merged from hostile-render.test.ts ---

describe('hostile-render', () => {
  /*
   * Hostile deck strings reach the screen as text: no element, script, handler
   * or request comes out of a deck. The engine rejects unsafe structure
   * (packages/decks/tests/untrusted.test.ts); this checks what the renderer
   * does with the strings that remain legal.
   */

  const SRC = join(import.meta.dirname, '../src');

  const PAYLOADS = [
    '<img src=x onerror="window.__deckHacked=1">',
    '<script>window.__deckHacked=1</script>',
    '<svg onload="window.__deckHacked=1"></svg>',
    '"><iframe src="javascript:window.__deckHacked=1"></iframe>',
    '{@html "<b>x</b>"}',
    'javascript:window.__deckHacked=1',
  ];

  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  let fetchSpy = vi.fn();
  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });
  afterEach(() => {
    cleanup();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((window as { __deckHacked?: unknown }).__deckHacked).toBeUndefined();
    vi.unstubAllGlobals();
  });

  /** A deck whose slide titles, quotes and notes are hostile strings, loaded the untrusted way. */
  function hostileDeck() {
    const quote = DECK_LAYOUTS.find((layout) => layout.id === 'quote')?.sample as Record<
      string,
      unknown
    >;
    const result = loadUntrustedDeck({
      style: {},
      slides: PAYLOADS.map((payload, i) => ({
        id: `s-${i}`,
        title: payload,
        layout: 'quote',
        props: { ...quote, quote: payload },
        notes: payload,
      })),
    });
    expect(result.issues).toEqual([]);
    if (!result.success) throw new Error('fixture failed');
    return result.deck;
  }

  describe('hostile deck strings render as inert text', () => {
    it('creates no elements, scripts or handlers from deck strings, on every slide', async () => {
      const deck = hostileDeck();
      for (let active = 0; active < deck.slides.length; active++) {
        window.location.hash = `#/s-${active}/0`;
        const view = render(DeckApp, { props: { deck } });
        const slide = await waitFor(() => {
          const node = view.container.querySelector<HTMLElement>(
            `[data-tx-deck-slide="s-${active}"]`
          );
          expect(node?.textContent).toContain(PAYLOADS[active]);
          return node as HTMLElement;
        });
        expect(slide.querySelector('script, iframe, object, embed, b')).toBeNull();
        for (const image of slide.querySelectorAll('img')) {
          expect(image.getAttribute('src') ?? '').not.toMatch(/^x$|javascript:/i);
        }
        for (const element of [slide, ...slide.querySelectorAll('*')]) {
          for (const attribute of element.getAttributeNames()) {
            expect(attribute.startsWith('on'), `${element.tagName} ${attribute}`).toBe(false);
          }
        }
        // The slide is named by its (hostile) title, as text.
        expect(slide.getAttribute('aria-label')).toContain(PAYLOADS[active]);
        cleanup();
        window.location.hash = '';
      }
    });

    it('never ships raw-HTML or code-evaluation sinks in decks-ui', () => {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const path = join(dir, entry);
          if (statSync(path).isDirectory()) walk(path);
          else if (/\.(svelte|ts)$/.test(entry)) files.push(path);
        }
      };
      walk(SRC);
      expect(files.length).toBeGreaterThan(0);
      const sinks =
        /\{@html|innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/;
      for (const file of files) {
        expect(readFileSync(file, 'utf8'), file).not.toMatch(sinks);
      }
    });
  });
});

// --- merged from deck-app-review-fixes.test.ts ---

describe('deck-app-review-fixes', () => {
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

  describe('the print page (W15)', () => {
    it('shows a loading status while the print view loads', () => {
      window.history.replaceState(null, '', '/?print=1');
      render(DeckApp, { props: { deck: fixtureDeck(), autofocus: false } });
      const status = screen.getByRole('status');
      expect(status.hasAttribute('data-py-deck-print-loading')).toBe(true);
      expect(status.textContent).toContain('Preparing the slides for printing');
    });
  });
});

// --- merged from renderers.test.ts ---

describe('renderers', () => {
  /**
   * Protoyard's renderer table for the `@texuli/slides` stage (DeckApp mounts it
   * with `defaultRenderers={false}`): it answers every slide kind a Protoyard
   * deck has, and its `validateBlock` replaces the stage's `@texuli/blocks`
   * check, so Protoyard-only blocks reach Protoyard's free-slide renderer.
   */
  const poll = {
    type: 'poll',
    id: 'p1',
    question: 'Which one?',
    options: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
  };

  function deck(): Deck {
    return {
      style: { aspect: '16:9' },
      slides: [
        { id: 'cover', layout: 'title-hero', props: { title: 'Hello' } },
        {
          id: 'vote',
          layout: 'free',
          steps: ['Ask', 'Vote'],
          blocks: [
            { type: 'heading', text: 'Vote now', level: 2 },
            { type: 'text', markdown: 'First', step: 1 },
            { ...poll, step: 2 },
          ],
        },
        { id: 'own', layout: 'custom', props: { component: 'pricing' } },
      ],
    } as unknown as Deck;
  }

  describe('the stage prepares a Protoyard deck with this table', () => {
    it('an untyped block is refused before the stage paints it', () => {
      const bad = deck();
      (bad.slides[1] as FreeSlide).blocks[2] = { id: 'p1' } as never;
      const stage = stageDeck(bad);
      const prepared = prepareDeck(
        stage.input,
        deckValidationHooks([createProtoyardRenderers(stage.freeSlides)])
      );
      // The deck model refuses it (an untyped item never reaches the block hook).
      expect(prepared.ok).toBe(false);
      expect(
        prepared.issues.some((issue) => issue.path.join('.').startsWith('slides.1.blocks.2'))
      ).toBe(true);
    });
  });
});
