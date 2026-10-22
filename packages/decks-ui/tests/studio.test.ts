import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DECK_LAYOUTS } from '@protoyard/decks';
import { applyDeckPatch } from '@protoyard/decks/patch';
import { type Deck, DeckSchema } from '@protoyard/decks/schema';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeckStudio, deckStudioTab } from '../src/studio/index.ts';
import StudioHarness from './fixtures/StudioHarness.svelte';

vi.mock('../src/layouts/index.ts', async () => {
  const Mock = (await import('./fixtures/MockLayoutRenderer.svelte')).default;
  return { DeckLayoutRenderer: Mock };
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const sample = (id: string) =>
  structuredClone(DECK_LAYOUTS.find((layout) => layout.id === id)?.sample);

const SOURCE: Deck = DeckSchema.parse({
  style: { theme: 'ocean' },
  slides: [
    { id: 'intro', title: 'Intro', layout: 'title-hero', props: sample('title-hero') },
    { id: 'photo', title: 'Photo', layout: 'image-left', props: sample('image-left') },
    { id: 'close', title: 'Close', layout: 'quote', props: sample('quote') },
  ],
});

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;
const choose = async (label: string, value: string) => {
  const element = select(label);
  element.value = value;
  await fireEvent.change(element);
  flushSync();
};

describe('the Deck Studio tab', () => {
  it('is a lazy DevTools tab that loads the panel only when opened', async () => {
    const studio = createDeckStudio(SOURCE);
    const tab = deckStudioTab(studio);
    expect(tab).toMatchObject({ id: 'deck-studio', label: 'Deck', props: { studio } });
    expect(typeof tab.icon).toBe('function');
    const Panel = await tab.load();
    expect(typeof Panel).toBe('function');
    // The tab module never imports the panel statically.
    const index = readFileSync(join(import.meta.dirname, '../src/studio/index.ts'), 'utf8');
    expect(index).not.toMatch(/^import .*DeckStudioPanel/m);
    expect(index).toMatch(/import\('\.\/DeckStudioPanel\.svelte'\)/);
  });
});

describe('Deck Studio panel', () => {
  it('renders the style, slide and export controls', () => {
    render(StudioHarness, { studio: createDeckStudio(SOURCE) });
    for (const label of [
      'Theme',
      'Font pair',
      'Aspect',
      'Motion',
      'Progress',
      'Layout',
      'Slide transition',
      'Deck background',
      'Slide background',
      'Deck patch (JSON)',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByText('No changes yet.')).toBeTruthy();
  });

  it('updates the live preview as edits are made', async () => {
    const studio = createDeckStudio(SOURCE);
    render(StudioHarness, { studio });
    const preview = screen.getByTestId('preview');
    expect(preview.textContent).toContain('Slide 1 of 3');

    await choose('Theme', 'emerald');
    expect(studio.preview.style.theme).toBe('emerald');

    // Hiding the current slide removes it from the deck the preview shows.
    await fireEvent.click(screen.getByLabelText('Hide this slide'));
    flushSync();
    expect(studio.preview.slides[0]?.hidden).toBe(true);
    await waitFor(() => expect(preview.textContent).toContain('of 2'));

    // Switching layout only offers layouts the slide's content already fits.
    await choose('Edit slide', 'photo');
    expect(Array.from(select('Layout').options).map((option) => option.value)).toEqual(
      expect.arrayContaining(['image-left', 'image-right'])
    );
    await choose('Layout', 'image-right');
    expect(studio.preview.slides[1]?.layout).toBe('image-right');
  });

  it('exports a patch that applies to the source and equals the preview, with copy and download', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const studio = createDeckStudio(SOURCE);
    render(StudioHarness, { studio });
    await choose('Aspect', '4:3');
    await choose('Deck background', 'gradient-dusk');
    await choose('Slide transition', 'zoom');

    const field = screen.getByLabelText('Deck patch (JSON)') as HTMLTextAreaElement;
    const patch = JSON.parse(field.value);
    expect(patch).toEqual(studio.patch);
    expect(DeckSchema.parse(applyDeckPatch(JSON.parse(JSON.stringify(SOURCE)), patch))).toEqual(
      studio.preview
    );
    expect(screen.getByText(/JSON Patch operations \(RFC 6902\)/)).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Copy patch' }));
    await waitFor(() => expect(screen.getByText('Patch copied.')).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith(studio.patchJson);

    const download = screen.getByRole('link', { name: 'Download patch' }) as HTMLAnchorElement;
    expect(download.getAttribute('download')).toBe('deck-studio.patch.json');
    expect(
      decodeURIComponent(download.getAttribute('href')?.split(',').slice(1).join(',') ?? '')
    ).toBe(studio.patchJson);

    await fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    flushSync();
    expect(studio.patch).toEqual([]);
  });

  it('falls back to selecting the patch when the clipboard is blocked', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    });
    const studio = createDeckStudio(SOURCE);
    render(StudioHarness, { studio });
    await choose('Motion', 'none');
    await fireEvent.click(screen.getByRole('button', { name: 'Copy patch' }));
    await waitFor(() => expect(screen.getByText(/the patch is selected/)).toBeTruthy());
  });

  it('follows the deck hash to the slide on screen', () => {
    const studio = createDeckStudio(SOURCE);
    const listeners = new Map<string, () => void>();
    const target = {
      location: { hash: '#/close/0' },
      addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
    };
    const stop = studio.followHash(target as never);
    expect(studio.slideId).toBe('close');
    target.location.hash = '#/photo/1';
    listeners.get('hashchange')?.();
    expect(studio.slideId).toBe('photo');
    target.location.hash = '#/unknown/0';
    listeners.get('hashchange')?.();
    expect(studio.slideId).toBe('photo');
    stop();
    expect(listeners.size).toBe(0);
  });
});

describe('Deck Studio for a blueprint file', () => {
  it('roots the patch at /deck, and it applies to the blueprint and gives the preview', () => {
    const studio = createDeckStudio(SOURCE, { pointer: '/deck' });
    studio.setStyle('theme', 'emerald');
    studio.setSlide('transition', 'fade');
    flushSync();
    expect(studio.patch.length).toBeGreaterThan(0);
    for (const op of studio.patch) expect(op.path.startsWith('/deck/')).toBe(true);
    expect(JSON.parse(studio.patchJson)).toEqual(studio.patch);
    const file = { kind: 'deck', name: 'Fictional deck', deck: structuredClone(SOURCE) };
    const patched = applyDeckPatch(file, studio.patch) as typeof file;
    expect(DeckSchema.parse(patched.deck)).toEqual(studio.preview);
    // Without a pointer the same edits target the deck document itself.
    const plain = createDeckStudio(SOURCE);
    plain.setStyle('theme', 'emerald');
    flushSync();
    expect(plain.patch.every((op) => !op.path.startsWith('/deck'))).toBe(true);
  });
});
