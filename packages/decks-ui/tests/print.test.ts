import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Deck } from '@protoyard/decks/schema';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeckPrint from '../src/print/DeckPrint.svelte';
import { deckPrintSearch, parseDeckPrintFlags } from '../src/print/detect.ts';
import PrintButton from '../src/print/PrintButton.svelte';

vi.mock('../src/layouts/index.ts', async () => {
  const Mock = (await import('./fixtures/MockLayoutRenderer.svelte')).default;
  return { DeckLayoutRenderer: Mock };
});

const SRC = join(import.meta.dirname, '..', 'src', 'print');

function sampleDeck(): Deck {
  return {
    style: { aspect: '16:9' },
    outline: {
      title: 'Harbor Ops',
      sections: [{ id: 'all', slideIds: ['title', 'hidden-slide', 'agenda'] }],
    },
    slides: [
      {
        id: 'title',
        title: 'Welcome',
        layout: 'title-hero',
        props: { title: 'Welcome', subtitle: 'Ops pitch' },
        steps: ['Show logo', 'Show tagline'],
        notes: 'Open with the problem.',
      },
      {
        id: 'hidden-slide',
        title: 'Internal only',
        layout: 'title-hero',
        props: { title: 'Hidden' },
        hidden: true,
      },
      {
        id: 'agenda',
        title: 'Agenda',
        layout: 'free',
        blocks: [
          { type: 'heading', text: 'Agenda', level: 2, step: 1 },
          { type: 'list', items: [{ text: 'One' }, { text: 'Two' }], step: 2 },
        ],
      },
    ],
  };
}

afterEach(() => cleanup());

describe('parseDeckPrintFlags', () => {
  it('reads print and notes from the query string', () => {
    expect(parseDeckPrintFlags('')).toEqual({ print: false, notes: false });
    expect(parseDeckPrintFlags('?print=1')).toEqual({ print: true, notes: false });
    expect(parseDeckPrintFlags('?print=true&notes=1')).toEqual({ print: true, notes: true });
    expect(parseDeckPrintFlags(new URLSearchParams('print=yes&notes=on'))).toEqual({
      print: true,
      notes: true,
    });
    expect(deckPrintSearch({ notes: true })).toBe('?print=1&notes=1');
  });
});

describe('DeckPrint DOM', () => {
  it('renders one page per non-hidden slide with every step visible', async () => {
    const deck = sampleDeck();
    const { container } = render(DeckPrint, { props: { deck } });

    await waitFor(() => {
      expect(container.querySelectorAll('[data-py-deck-print-page]').length).toBe(2);
    });

    const root = container.querySelector('[data-py-deck-print]');
    expect(root).toBeTruthy();
    expect(root?.getAttribute('data-aspect')).toBe('16:9');
    expect(root?.getAttribute('style')).toMatch(/--py-deck-print-width:\s*1280px/);
    expect(root?.getAttribute('style')).toMatch(/--py-deck-print-height:\s*720px/);

    const pages = [...container.querySelectorAll('[data-py-deck-print-page]')];
    expect(pages.map((el) => el.getAttribute('data-py-deck-slide'))).toEqual(['title', 'agenda']);
    expect(container.querySelector('[data-py-deck-slide="hidden-slide"]')).toBeNull();

    for (const page of pages) {
      const step = Number(page.getAttribute('data-step'));
      const count = Number(page.getAttribute('data-step-count'));
      expect(count).toBeGreaterThanOrEqual(1);
      expect(step).toBe(count - 1);
      expect(page.getAttribute('style') ?? '').toMatch(
        new RegExp(`--py-deck-step:\\s*${step}`)
      );
      expect(page.querySelector('[data-py-deck-print-canvas]')).toBeTruthy();
    }

    expect(container.querySelectorAll('[data-py-deck-print-notes-block]').length).toBe(0);
  });

  it('includes speaker notes when notes is true', async () => {
    const deck = sampleDeck();
    const { container } = render(DeckPrint, { props: { deck, notes: true } });
    await waitFor(() => {
      expect(container.querySelectorAll('[data-py-deck-print-page]').length).toBe(2);
    });
    const notes = container.querySelectorAll('[data-py-deck-print-notes-block]');
    expect(notes.length).toBe(1);
    expect(notes[0]?.textContent).toMatch(/Open with the problem/);
  });

  it('uses 9:16 canvas variables when the deck aspect is portrait', async () => {
    const deck = { ...sampleDeck(), style: { aspect: '9:16' as const } };
    const { container } = render(DeckPrint, { props: { deck } });
    await waitFor(() => {
      expect(container.querySelector('[data-py-deck-print]')).toBeTruthy();
    });
    const style = container.querySelector('[data-py-deck-print]')?.getAttribute('style') ?? '';
    expect(style).toMatch(/--py-deck-print-width:\s*720px/);
    expect(style).toMatch(/--py-deck-print-height:\s*1280px/);
  });
});

describe('print stylesheet', () => {
  it('declares @page size and page breaks with exact color adjust', () => {
    const css = readFileSync(join(SRC, 'print.css'), 'utf8');
    expect(css).toMatch(/@media\s+print/);
    expect(css).toMatch(/@page/);
    expect(css).toMatch(/size:\s*var\(--py-deck-print-width\)\s+var\(--py-deck-print-height\)/);
    expect(css).toMatch(/page-break-after:\s*always|break-after:\s*page/);
    expect(css).toMatch(/print-color-adjust:\s*exact/);
    expect(css).toMatch(/-webkit-print-color-adjust:\s*exact/);
    expect(css).toMatch(/data-py-deck-print-page/);
    expect(css).toMatch(/data-py-print-button/);
  });
});

describe('PrintButton', () => {
  it('exposes a control that calls window.print and hides itself on paper', () => {
    const original = window.print;
    let calls = 0;
    window.print = (() => {
      calls += 1;
    }) as typeof window.print;
    try {
      render(PrintButton, { props: { label: 'Print deck' } });
      const button = screen.getByRole('button', { name: /Print deck/i });
      expect(button.getAttribute('data-py-print-button')).not.toBeNull();
      button.click();
      expect(calls).toBe(1);
    } finally {
      window.print = original;
    }
  });
});
