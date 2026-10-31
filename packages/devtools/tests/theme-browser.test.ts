import { defineTheme, type Theme } from '@protoyard/core';
import { fireEvent, screen, waitFor, within } from '@testing-library/svelte';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createPrototypeRuntime, type ProtoyardRuntime } from '../../runtime/src/index.ts';
import { createTasksDefinition } from '../../runtime/tests/fixtures/tasks-prototype.ts';
import { BUILTIN_THEMES, oceanTheme } from '../../themes/src/index.ts';
import { disableFullThemeLibrary, enableFullThemeLibrary } from '../../themes/src/library/full.ts';
import {
  ALL_LIBRARY_THEME_IDS,
  clearLibraryThemeCache,
  EXPANDED_LIBRARY_THEME_IDS,
  findLibraryThemeMeta,
  getLibraryThemeMeta,
  listFullThemeLibrary,
  loadLibraryTheme,
  searchFullThemeLibrary,
  THEME_LIBRARY_META,
} from '../../themes/src/library/index.ts';
import { type DevtoolsHandle, mountDevtools } from '../src/index.ts';
import { librarySwatches } from '../src/sections/ThemeBrowser.svelte';
import { selectOption } from './select-option.ts';

/**
 * The theme browser in DevTools → Look, on a real runtime whose resolver
 * loads library themes (as mountPrototype wires it). The resolver can be held
 * open so the pending state is observable.
 */

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  flushSync();
};

let handle: DevtoolsHandle | undefined;
const runtimes: ProtoyardRuntime[] = [];
afterEach(async () => {
  await handle?.destroy();
  handle = undefined;
  for (const runtime of runtimes.splice(0)) runtime.close();
  clearLibraryThemeCache();
  localStorage.clear();
  document.body.replaceChildren();
});

const harborTheme: Theme = defineTheme({
  ...oceanTheme,
  id: 'harbor',
  name: 'Harbor',
  description: 'This prototype’s own theme.',
});

async function open(options: { gate?: Promise<void> } = {}) {
  const runtime = await createPrototypeRuntime(
    createTasksDefinition({ namespace: 'browser-fixture' }),
    {
      indexedDB: new IDBFactory() as unknown as globalThis.IDBFactory,
      IDBKeyRange,
      themes: [...BUILTIN_THEMES, harborTheme],
      sleep: async () => {},
      resolveTheme: async (id) => {
        await options.gate;
        return (await findLibraryThemeMeta(id)) ? loadLibraryTheme(id) : undefined;
      },
    }
  );
  await runtime.scenarios.ensureSeeded();
  runtimes.push(runtime);
  handle = mountDevtools({ runtime, themes: BUILTIN_THEMES });
  flushSync();
  await fireEvent.keyDown(window, { key: '.', ctrlKey: true });
  await settle();
  const panel = screen.getByRole('complementary', { name: 'Protoyard DevTools' });
  await fireEvent.click(within(panel).getByRole('tab', { name: 'Look' }));
  await settle();
  return { runtime, panel, browser: within(within(panel).getByTestId('theme-browser')) };
}

const radioNames = (group: HTMLElement) =>
  within(group)
    .getAllByRole('radio')
    .map((radio) => radio.getAttribute('data-theme-id'));

/** The library radios once the expanded set's metadata has loaded. */
async function libraryRadios(browser: ReturnType<typeof within>, expected: readonly string[]) {
  await waitFor(() =>
    expect(radioNames(browser.getByRole('radiogroup', { name: 'Theme library' }))).toEqual(expected)
  );
  await waitFor(() => expect(browser.queryByText(/more library themes…/)).toBeNull());
}

describe('DevTools theme browser', () => {
  it('groups the prototype’s own, built-in and custom themes, with the library collapsed', async () => {
    const { runtime, browser } = await open();
    expect(radioNames(browser.getByRole('radiogroup', { name: 'This prototype' }))).toEqual([
      'harbor',
    ]);
    expect(radioNames(browser.getByRole('radiogroup', { name: 'Built-in' }))).toEqual(
      BUILTIN_THEMES.map((theme) => theme.id)
    );
    expect(browser.queryByRole('radiogroup', { name: 'Custom' })).toBeNull();
    expect(browser.queryByRole('radiogroup', { name: 'Theme library' })).toBeNull();

    await runtime.theme.saveCustom({ ...oceanTheme, id: 'my-blue', name: 'My Blue' });
    await settle();
    // The panel re-reads the runtime list when appearance changes.
    await runtime.theme.setOverride({ mode: 'dark' });
    await settle();
    expect(radioNames(browser.getByRole('radiogroup', { name: 'Custom' }))).toEqual(['my-blue']);

    await fireEvent.click(browser.getByRole('button', { name: 'Browse 204 more themes' }));
    await settle();
    // Every library theme: the catalog, then Texuli's expanded set once it loads.
    await libraryRadios(browser, ALL_LIBRARY_THEME_IDS);
  });

  it('keeps the catalog when the expanded set cannot load', async () => {
    disableFullThemeLibrary();
    try {
      const { browser } = await open();
      await fireEvent.click(browser.getByRole('button', { name: /Browse \d+ more themes/ }));
      await settle();
      await libraryRadios(
        browser,
        THEME_LIBRARY_META.map((meta) => meta.id)
      );
    } finally {
      enableFullThemeLibrary();
    }
  });

  it('applies an expanded library theme by id', async () => {
    const id = EXPANDED_LIBRARY_THEME_IDS[0] as string;
    const meta = await findLibraryThemeMeta(id);
    if (!meta) throw new Error(`${id} is missing`);
    const { runtime, browser } = await open();
    await fireEvent.input(browser.getByLabelText('Search themes'), { target: { value: meta.id } });
    await settle();
    await libraryRadios(
      browser,
      (await searchFullThemeLibrary(meta.id)).map((entry) => entry.id)
    );
    await fireEvent.click(browser.getByRole('radio', { name: new RegExp(meta.name) }));
    await waitFor(() => expect(runtime.theme.appearance().theme.value).toBe(id));
    expect(getLibraryThemeMeta(id)).toBeUndefined();
  });

  it('searches every group and the library, and announces the count', async () => {
    const { browser } = await open();
    await fireEvent.input(browser.getByLabelText('Search themes'), { target: { value: 'okabe' } });
    await settle();
    const expected = (await searchFullThemeLibrary('okabe')).map((meta) => meta.id);
    expect(expected.length).toBeGreaterThanOrEqual(2);
    await libraryRadios(browser, expected);
    expect(browser.getByRole('status').textContent).toBe(`${expected.length} themes match`);
    expect(browser.queryByRole('radiogroup', { name: 'Built-in' })).toBeNull();

    await fireEvent.input(browser.getByLabelText('Search themes'), { target: { value: 'ocean' } });
    await settle();
    expect(radioNames(browser.getByRole('radiogroup', { name: 'Built-in' }))).toEqual(['ocean']);
  });

  it('filters the library by collection chip and by tag', async () => {
    const { browser } = await open();
    await fireEvent.click(browser.getByRole('button', { name: /Browse \d+ more themes/ }));
    await settle();
    await libraryRadios(browser, ALL_LIBRARY_THEME_IDS);
    await fireEvent.click(browser.getByRole('button', { name: /^high-contrast/ }));
    await settle();
    const highContrast = (await listFullThemeLibrary({ collection: 'high-contrast' })).map(
      (meta) => meta.id
    );
    expect(radioNames(browser.getByRole('radiogroup', { name: 'Theme library' }))).toEqual(
      highContrast
    );
    expect(
      browser.getByRole('button', { name: /^high-contrast/ }).getAttribute('aria-pressed')
    ).toBe('true');

    await fireEvent.click(browser.getByRole('button', { name: 'All' }));
    await selectOption('Filter by tag', 'neon');
    await settle();
    expect(radioNames(browser.getByRole('radiogroup', { name: 'Theme library' }))).toEqual(
      (await listFullThemeLibrary({ tag: 'neon' })).map((meta) => meta.id)
    );
  });

  it('shows seed swatches before load, the pending state while loading, then applies the theme', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { runtime, browser } = await open({ gate });
    await fireEvent.input(browser.getByLabelText('Search themes'), {
      target: { value: 'fintech ledger' },
    });
    await settle();
    await waitFor(() => expect(browser.queryByText(/more library themes…/)).toBeNull());
    const card = browser.getByRole('radio', { name: /Fintech Ledger/ });
    const meta = getLibraryThemeMeta('fintech-ledger');
    if (!meta) throw new Error('fintech-ledger is missing');
    const swatchColors = () =>
      [...card.querySelectorAll<HTMLElement>('[aria-hidden="true"] > span')].map(
        (swatch) => swatch.style.backgroundColor
      );
    expect(swatchColors()).toHaveLength(librarySwatches(meta).length);

    await fireEvent.click(card);
    await settle();
    expect(card.getAttribute('aria-busy')).toBe('true');
    expect(runtime.theme.appearance().theme.value).not.toBe('fintech-ledger');

    release();
    await waitFor(() => expect(runtime.theme.appearance().theme.value).toBe('fintech-ledger'));
    await settle();
    expect(runtime.theme.appearance().theme.source).toBe('override');
    expect(card.getAttribute('aria-busy')).toBeNull();
    expect(card.getAttribute('aria-checked')).toBe('true');
    // Loaded: the card now shows four token swatches.
    expect(swatchColors()).toHaveLength(4);
  });

  it('saves a library theme as the persona preference when that target is chosen', async () => {
    const { runtime, panel, browser } = await open();
    await fireEvent.click(within(panel).getByRole('radio', { name: 'Persona preference' }));
    await fireEvent.input(browser.getByLabelText('Search themes'), {
      target: { value: 'harbor teal' },
    });
    await settle();
    await waitFor(() => expect(browser.queryByText(/more library themes…/)).toBeNull());
    await fireEvent.click(browser.getByRole('radio', { name: /Harbor Teal/ }));
    await waitFor(() => expect(runtime.theme.appearance().theme.value).toBe('harbor-teal'));
    expect(runtime.theme.appearance().theme.source).toBe('preference');
  });

  it('moves between radios of a group with arrow keys, Home and End (one tab stop)', async () => {
    const { browser } = await open();
    const group = browser.getByRole('radiogroup', { name: 'Built-in' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
    radios[0]?.focus();
    await fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(radios[1]);
    await fireEvent.keyDown(group, { key: 'End' });
    expect(document.activeElement).toBe(radios.at(-1));
    await fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(radios[0]);
    await fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(radios.at(-1));
    await fireEvent.keyDown(group, { key: 'Home' });
    expect(document.activeElement).toBe(radios[0]);
  });
});
