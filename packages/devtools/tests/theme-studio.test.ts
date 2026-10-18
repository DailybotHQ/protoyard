import { fireEvent, screen, waitFor, within } from '@testing-library/svelte';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createPrototypeRuntime, type ProtoyardRuntime } from '../../runtime/src/index.ts';
import { createTasksDefinition } from '../../runtime/tests/fixtures/tasks-prototype.ts';
import { BUILTIN_THEMES, createThemeFromSeed } from '../../themes/src/index.ts';
import { type DevtoolsHandle, mountDevtools } from '../src/index.ts';

/**
 * The Theme Studio inside the real DevTools panel, on a real runtime with an
 * in-memory IndexedDB: build → preview → save → reload → export → import.
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
  localStorage.clear();
  document.body.replaceChildren();
});

function storage() {
  const indexedDB = new IDBFactory() as unknown as globalThis.IDBFactory;
  const definition = createTasksDefinition({ namespace: 'studio-fixture' });
  return async () => {
    const runtime = await createPrototypeRuntime(definition, {
      indexedDB,
      IDBKeyRange,
      themes: BUILTIN_THEMES,
      sleep: async () => {},
    });
    await runtime.scenarios.ensureSeeded();
    runtimes.push(runtime);
    return runtime;
  };
}

async function openStudio(runtime: ProtoyardRuntime) {
  handle = mountDevtools({ runtime, themes: BUILTIN_THEMES });
  flushSync();
  await fireEvent.keyDown(window, { key: '.', ctrlKey: true });
  await settle();
  const panel = screen.getByRole('complementary', { name: 'Protoyard DevTools' });
  await fireEvent.click(within(panel).getByRole('tab', { name: 'Look' }));
  await settle();
  // Lazy: nothing of the Studio exists until it is opened.
  expect(within(panel).queryByTestId('theme-studio')).toBeNull();
  await fireEvent.click(within(panel).getByRole('button', { name: 'Open studio' }));
  await waitFor(() => expect(within(panel).getByTestId('theme-studio')).toBeTruthy());
  return panel;
}

const type = async (element: HTMLElement, value: string) => {
  await fireEvent.input(element, { target: { value } });
  await settle();
};

describe('Theme Studio (DevTools)', () => {
  it('builds a theme from a seed, previews it, saves it and keeps it across a reload', async () => {
    const boot = storage();
    let runtime = await boot();
    let panel = await openStudio(runtime);

    await type(within(panel).getByLabelText('Theme name'), 'Sunset Brand');
    await type(within(panel).getByLabelText('Seed color'), '#e8590c');
    await fireEvent.click(within(panel).getByRole('radio', { name: 'Glass' }));
    await fireEvent.click(within(panel).getByRole('radio', { name: 'Inset' }));
    await settle();

    // Scoped live preview: the draft's tokens land on the preview box only.
    const preview = within(panel).getByTestId('theme-studio-preview');
    const expected = createThemeFromSeed({
      id: 'sunset-brand',
      name: 'Sunset Brand',
      seed: '#e8590c',
    });
    expect(preview.style.getPropertyValue('--py-primary')).toBe(expected.light.primary);
    expect(preview.dataset.pyCardStyle).toBe('glass');
    expect(preview.dataset.pyFocusRingStyle).toBe('inset');
    expect(document.documentElement.style.getPropertyValue('--py-primary')).not.toBe(
      expected.light.primary
    );
    expect(within(panel).getByText(/meet WCAG AA in light and dark/)).toBeTruthy();

    await fireEvent.click(within(panel).getByRole('button', { name: 'Save and preview' }));
    await settle();
    expect(runtime.theme.customThemes().map((t) => t.id)).toEqual(['sunset-brand']);
    expect(runtime.theme.get('sunset-brand')?.style).toMatchObject({
      surface: 'glass',
      focusRing: { style: 'inset' },
    });
    expect(runtime.theme.appearance().theme).toMatchObject({
      value: 'sunset-brand',
      source: 'override',
    });
    // The new theme shows up in the theme grid and in the saved list.
    expect(within(panel).getByRole('radio', { name: /Sunset Brand/ })).toBeTruthy();
    expect(
      within(within(panel).getByRole('list', { name: 'Saved custom themes' })).getByText(
        'Sunset Brand'
      )
    ).toBeTruthy();

    await handle?.destroy();
    handle = undefined;
    runtime.close();
    // The panel remembers it was open; start closed so Ctrl+. opens it again.
    localStorage.clear();
    runtime = await boot();
    expect(runtime.theme.customThemes().map((t) => t.id)).toEqual(['sunset-brand']);
    expect(runtime.theme.appearance().theme.value).toBe('sunset-brand');
    panel = await openStudio(runtime);
    expect(within(panel).getByRole('button', { name: 'Delete Sunset Brand' })).toBeTruthy();
  });

  it('shows an inline error for an invalid seed and saves nothing', async () => {
    const runtime = await storage()();
    const panel = await openStudio(runtime);
    await type(within(panel).getByLabelText('Seed color'), 'orange');
    expect(within(panel).getByRole('alert').textContent).toMatch(/hex color/);
    expect(within(panel).queryByRole('button', { name: 'Save' })).toBeNull();
    expect(runtime.theme.customThemes()).toEqual([]);
  });

  it('exports, deletes and re-imports a theme; bad JSON is refused inline', async () => {
    const runtime = await storage()();
    await runtime.theme.saveCustom(
      createThemeFromSeed({ id: 'ocean-x', name: 'Ocean X', seed: '#1971c2' })
    );
    const panel = await openStudio(runtime);

    await fireEvent.click(within(panel).getByRole('button', { name: 'Export Ocean X' }));
    await settle();
    const json = (within(panel).getByLabelText('Exported theme JSON') as HTMLTextAreaElement).value;
    expect(JSON.parse(json)).toMatchObject({ theme: { id: 'ocean-x' } });
    const link = within(panel).getByRole('link', { name: /Download ocean-x\.theme\.json/ });
    expect(link.getAttribute('download')).toBe('ocean-x.theme.json');

    await fireEvent.click(within(panel).getByRole('button', { name: 'Delete Ocean X' }));
    await settle();
    expect(runtime.theme.customThemes()).toEqual([]);

    const box = within(panel).getByLabelText('Theme JSON to import');
    await type(box, '{"not": "a theme"');
    await fireEvent.click(within(panel).getByRole('button', { name: 'Import' }));
    await settle();
    expect(within(panel).getByRole('alert').textContent).toMatch(/not valid JSON/);

    await type(
      box,
      JSON.stringify({ format: 'protoyard-theme/v1', theme: { id: 'x', name: 'X' } })
    );
    await fireEvent.click(within(panel).getByRole('button', { name: 'Import' }));
    await settle();
    expect(within(panel).getByRole('alert').textContent).toMatch(/light/);
    expect(runtime.theme.customThemes()).toEqual([]);

    await type(box, json);
    await fireEvent.click(within(panel).getByRole('button', { name: 'Import' }));
    await settle();
    expect(runtime.theme.customThemes().map((t) => t.id)).toEqual(['ocean-x']);
    expect(within(panel).getByRole('button', { name: 'Delete Ocean X' })).toBeTruthy();
  });
});
