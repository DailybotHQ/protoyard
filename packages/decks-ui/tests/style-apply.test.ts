import { DECK_BACKGROUND_PRESET_IDS, resolveDeckBackground } from '@protoyard/decks';
import type { Deck } from '@protoyard/decks/schema';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadAllLibraryThemes } from '../../themes/src/library/registry.ts';
import { BUILTIN_THEMES } from '../../themes/src/presets.ts';
import { DeckApp } from '../src/app/index.ts';
import { DeckPrint } from '../src/print/index.ts';
import {
  backgroundSamples,
  contrast,
  type DeckTheme,
  resolveDeckLook,
  slideSurface,
  TEXT_TOKENS,
} from '../src/style/kit.ts';

/**
 * AC-deck-style-apply: deck.style and slide.background reach the rendered
 * slides (canvas, overview, print), scoped to the deck root; an unknown
 * theme falls back visibly; text stays ≥ 4.5:1 on every background preset in
 * every built-in and library theme, light and dark.
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

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

const MODES = ['light', 'dark'] as const;

describe('slide surfaces stay readable on every background preset', () => {
  let themes: DeckTheme[] = [];
  beforeAll(async () => {
    themes = [
      ...(BUILTIN_THEMES as unknown as DeckTheme[]),
      ...((await loadAllLibraryThemes()) as unknown as DeckTheme[]),
    ];
  });

  it('covers the 6 built-in and the library themes, 13 presets, both modes', () => {
    expect(themes.length).toBeGreaterThanOrEqual(6 + 64);
    expect(DECK_BACKGROUND_PRESET_IDS).toHaveLength(13);
  });

  it('keeps every text token at WCAG AA on every sample of every preset', () => {
    const failures: string[] = [];
    for (const theme of themes) {
      for (const mode of MODES) {
        const palette = theme[mode];
        for (const preset of DECK_BACKGROUND_PRESET_IDS) {
          const surface = slideSurface(preset, palette);
          const samples = backgroundSamples(resolveDeckBackground(preset, palette as never));
          for (const token of TEXT_TOKENS) {
            const worst = Math.min(
              ...samples.map((sample) => contrast(surface.text[token], sample))
            );
            if (worst < 4.5)
              failures.push(`${theme.id}/${mode}/${preset}/${token}: ${worst.toFixed(2)}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('flips a light theme to light ink on dark presets and leaves its own surface alone', () => {
    const violet = BUILTIN_THEMES[0] as unknown as DeckTheme;
    const dusk = slideSurface('gradient-dusk', violet.light);
    expect(dusk).toMatchObject({
      kind: 'gradient',
      preset: 'gradient-dusk',
      tone: 'light',
      inverse: true,
    });
    expect(dusk.style).toContain('linear-gradient(135deg');
    expect(dusk.style).toContain(`--py-foreground:${dusk.ink}`);
    expect(dusk.style).toContain('--py-surface:transparent');
    const surface = slideSurface('solid-surface', violet.light);
    expect(surface.inverse).toBe(false);
    expect(surface.style).not.toContain('--py-surface:transparent');
    expect(slideSurface('pattern-grid', violet.light).style).toContain('linear-gradient(90deg');
    expect(slideSurface('pattern-dots', violet.light).style).toContain('radial-gradient(circle');
  });

  it('never lets an author string reach CSS: unknown presets fall back with a warning', () => {
    const violet = BUILTIN_THEMES[0] as unknown as DeckTheme;
    const hostile = slideSurface('x;background:url(https://evil.example.com/a.png)', violet.light);
    expect(hostile.warning).toMatch(/Unknown background/);
    expect(hostile.preset).toBe('solid-color');
    expect(hostile.style).not.toMatch(/url\(|evil/);
  });

  it('resolves themes lazily and falls back from unknown themes and fonts', async () => {
    const aurora = await resolveDeckLook(
      { theme: 'aurora-analytics', fontPair: 'geometric', radius: 'large' },
      'light'
    );
    expect(aurora.themeId).toBe('aurora-analytics');
    // Texuli components read the canonical --tx-* names; the --py-* aliases follow.
    for (const prefix of ['--tx', '--py']) {
      expect(aurora.rootStyle).toContain(`${prefix}-radius:1rem`);
      expect(aurora.rootStyle).toMatch(
        new RegExp(`${prefix}-font-sans:var\\(--tx-font-stack-geometric-sans, "Avenir Next"`)
      );
    }
    expect(aurora.warnings).toEqual([]);
    const unknown = await resolveDeckLook(
      { theme: 'no-such-theme', fontPair: 'no-such-font' },
      'light'
    );
    expect(unknown.themeId).toBe(BUILTIN_THEMES[0]?.id);
    expect(unknown.warnings.join(' ')).toMatch(
      /Unknown theme "no-such-theme".*Unknown font pairing "no-such-font"/
    );
    const remoteLogo = await resolveDeckLook(
      { logo: 'https://evil.example.com/logo.png' },
      'light'
    );
    expect(remoteLogo.logo).toBeUndefined();
    expect(remoteLogo.warnings.join(' ')).toMatch(/logo/);
  });
});

function styledDeck(style: Deck['style'] = {}): Deck {
  return {
    style: {
      aspect: '16:9',
      theme: 'aurora-analytics',
      fontPair: 'geometric',
      density: 'spacious',
      radius: 'large',
      background: 'solid-surface',
      footer: 'Fictional figures',
      slideNumbers: true,
      ...style,
    },
    outline: {
      title: 'Styled deck',
      sections: [{ id: 'all', slideIds: ['cover', 'quote', 'plain'] }],
    },
    slides: [
      {
        id: 'cover',
        title: 'Cover',
        layout: 'title-hero',
        background: 'gradient-dusk',
        props: { title: 'Hello' },
      },
      {
        id: 'quote',
        title: 'Quote',
        layout: 'quote',
        background: 'pattern-dots',
        props: { quote: 'Q' },
      },
      {
        id: 'plain',
        title: 'Plain',
        layout: 'free',
        blocks: [{ type: 'heading', text: 'Plain', level: 2 }],
      },
    ],
  } as unknown as Deck;
}

const ready = (root: HTMLElement) =>
  waitFor(() => expect(root.getAttribute('data-py-deck-style')).toBe('ready'), { timeout: 10_000 });
const frameOf = (container: HTMLElement, id: string) =>
  container.querySelector(
    `[data-py-deck-slide="${id}"] [data-py-deck-frame]`
  ) as HTMLElement | null;

describe('DeckApp applies deck.style', () => {
  it('scopes the theme, fonts, radius and density to the deck root, never to <html>', async () => {
    const { container } = render(DeckApp, {
      deck: styledDeck(),
      syncHash: false,
      autofocus: false,
    });
    const root = container.querySelector('[data-py-deck-app]') as HTMLElement;
    await ready(root);
    expect(root.getAttribute('data-py-deck-theme')).toBe('aurora-analytics');
    expect(root.getAttribute('data-py-deck-mode')).toBe('light');
    const prop = (name: string) => root.style.getPropertyValue(name).trim();
    expect(prop('--py-radius')).toBe('1rem');
    expect(prop('--py-deck-density')).toBe('1.25');
    expect(prop('--py-font-heading')).toContain('"Avenir Next"');
    expect(prop('--py-primary')).toMatch(/^#[0-9a-f]{6}$/i);
    // Base-layer aliases (headings, body font, default borders) follow the deck, not :root.
    expect(prop('--font-heading')).toBe('var(--py-font-heading)');
    expect(prop('--color-border')).toBe('var(--py-border)');
    expect(root.style.fontFamily).toBe('var(--py-font-sans)');
    // The host page and DevTools keep their own theme.
    expect(document.documentElement.style.getPropertyValue('--py-primary')).toBe('');
    expect(document.documentElement.getAttribute('data-py-theme')).not.toBe('aurora-analytics');
  });

  it('paints each slide with its own background, else the deck background, plus footer and number', async () => {
    const { container } = render(DeckApp, {
      deck: styledDeck(),
      syncHash: false,
      autofocus: false,
    });
    const root = container.querySelector('[data-py-deck-app]') as HTMLElement;
    await ready(root);
    const cover = frameOf(container, 'cover') as HTMLElement;
    expect(cover.getAttribute('data-py-deck-background')).toBe('gradient-dusk');
    expect(cover.getAttribute('data-py-deck-inverse')).toBe('true');
    expect(cover.getAttribute('style')).toContain('linear-gradient(');
    // Flipped tokens reach base rules (default borders) inside the slide too.
    expect(cover.style.getPropertyValue('--color-border').trim()).toBe('var(--py-border)');
    expect(cover.querySelector('[data-py-deck-footer-text]')?.textContent).toBe(
      'Fictional figures'
    );
    expect(cover.querySelector('[data-py-deck-slide-number-mark]')?.textContent).toBe('1');
    expect(frameOf(container, 'quote')?.getAttribute('data-py-deck-background')).toBe(
      'pattern-dots'
    );
    await fireEvent.keyDown(root, { key: 'End' });
    await waitFor(() => expect(frameOf(container, 'plain')).not.toBeNull());
    expect(frameOf(container, 'plain')?.getAttribute('data-py-deck-background')).toBe(
      'solid-surface'
    );
    expect(
      frameOf(container, 'plain')?.querySelector('[data-py-deck-slide-number-mark]')?.textContent
    ).toBe('3');
  });

  it('hides slide numbers and footer when the deck turns them off', async () => {
    const { container } = render(DeckApp, {
      deck: styledDeck({ slideNumbers: false, footer: undefined }),
      syncHash: false,
      autofocus: false,
    });
    await ready(container.querySelector('[data-py-deck-app]') as HTMLElement);
    expect(frameOf(container, 'cover')?.querySelector('[data-py-deck-footer]')).toBeNull();
  });

  it('falls back from an unknown theme visibly, without crashing', async () => {
    const { container } = render(DeckApp, {
      deck: styledDeck({ theme: 'no-such-theme' }),
      syncHash: false,
      autofocus: false,
    });
    const root = container.querySelector('[data-py-deck-app]') as HTMLElement;
    await ready(root);
    expect(root.getAttribute('data-py-deck-theme')).toBe(BUILTIN_THEMES[0]?.id);
    expect(container.querySelector('[data-py-deck-style-warning]')?.textContent).toMatch(
      /Unknown theme "no-such-theme"/
    );
    expect(frameOf(container, 'cover')?.getAttribute('data-py-deck-background')).toBe(
      'gradient-dusk'
    );
  });

  it('renders in dark mode with the dark palette', async () => {
    const { container } = render(DeckApp, {
      deck: styledDeck(),
      syncHash: false,
      autofocus: false,
      mode: 'dark',
    });
    const root = container.querySelector('[data-py-deck-app]') as HTMLElement;
    await ready(root);
    expect(root.getAttribute('data-py-deck-mode')).toBe('dark');
    const look = await resolveDeckLook(styledDeck().style, 'dark');
    expect(root.style.getPropertyValue('--py-background').trim()).toBe(look.palette.background);
  });

  it('paints overview thumbnails with the same backgrounds', async () => {
    const { container } = render(DeckApp, {
      deck: styledDeck(),
      syncHash: false,
      autofocus: false,
    });
    const root = container.querySelector('[data-py-deck-app]') as HTMLElement;
    await ready(root);
    await fireEvent.keyDown(root, { key: 'o' });
    await waitFor(
      () =>
        expect(
          container
            .querySelector('[data-py-deck-overview-thumb="cover"] [data-py-deck-frame]')
            ?.getAttribute('data-py-deck-background')
        ).toBe('gradient-dusk'),
      { timeout: 10_000 }
    );
    expect(
      container
        .querySelector('[data-py-deck-overview-thumb="plain"] [data-py-deck-frame]')
        ?.getAttribute('data-py-deck-background')
    ).toBe('solid-surface');
  });
});

describe('DeckPrint applies deck.style on its own', () => {
  it('themes the print root and paints every page', async () => {
    const { container } = render(DeckPrint, { deck: styledDeck() });
    const print = container.querySelector('[data-py-deck-print]') as HTMLElement;
    await waitFor(() => expect(print.getAttribute('data-py-deck-theme')).toBe('aurora-analytics'), {
      timeout: 10_000,
    });
    expect(print.style.getPropertyValue('--py-radius').trim()).toBe('1rem');
    const pages = [...container.querySelectorAll('[data-py-deck-print-page] [data-py-deck-frame]')];
    expect(pages.map((page) => page.getAttribute('data-py-deck-background'))).toEqual([
      'gradient-dusk',
      'pattern-dots',
      'solid-surface',
    ]);
    expect(
      pages.every((page) => /print-color-adjust:\s*exact/.test(page.getAttribute('style') ?? ''))
    ).toBe(true);
  });
});
