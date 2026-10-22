import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DECK_LAYOUTS, loadUntrustedDeck } from '@protoyard/decks';
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeckCanvasHarness from './fixtures/DeckCanvasHarness.svelte';

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

/** A deck whose slide titles and quotes are hostile strings, loaded the untrusted way. */
function hostileSlides() {
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
  return result.deck.slides.map((slide) => ({ id: slide.id, title: slide.title ?? '' }));
}

describe('hostile deck strings render as inert text', () => {
  it('creates no elements, scripts or handlers from deck strings', () => {
    const slides = hostileSlides();
    for (let active = 0; active < slides.length; active++) {
      render(DeckCanvasHarness, { slides, activeIndex: active });
      const canvas = screen.getByTestId('deck-canvas');
      expect(canvas.querySelector('script, img, svg, iframe, b, object, embed')).toBeNull();
      for (const element of canvas.querySelectorAll('*')) {
        for (const attribute of element.getAttributeNames()) {
          expect(attribute.startsWith('on'), `${element.tagName} ${attribute}`).toBe(false);
        }
      }
      const content = screen.getByTestId(`slide-content-${active}`);
      expect(content.textContent).toBe(PAYLOADS[active]);
      expect(content.children).toHaveLength(0);
      // The accessible name carries the title as text too.
      const group = content.closest('[aria-roledescription="slide"]');
      expect(group?.getAttribute('aria-label')).toBe(
        `${active + 1} of ${slides.length}: ${PAYLOADS[active]}`
      );
      cleanup();
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
