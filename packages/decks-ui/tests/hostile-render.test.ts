import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DECK_LAYOUTS, loadUntrustedDeck } from '@protoyard/decks';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckApp } from '../src/app/index.ts';

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
