import { fireEvent, screen, waitFor, within } from '@testing-library/svelte';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { bindAppearance } from '../../renderer-svelte/src/appearance.ts';
import { createPrototypeRuntime, type ProtoyardRuntime } from '../../runtime/src/index.ts';
import { createTasksDefinition } from '../../runtime/tests/fixtures/tasks-prototype.ts';
import { BUILTIN_THEMES, hasDesignSystemPainter } from '../../themes/src/index.ts';
import { forgetDesignSystemTheme } from '../../themes/src/texuli.ts';
import {
  readStoredDesignSystems,
  restoreDesignSystems,
  storeDesignSystem,
} from '../src/design-systems.ts';
import { type DevtoolsHandle, mountDevtools } from '../src/index.ts';

/**
 * Design systems in Theme Studio, inside the real DevTools panel on a real
 * runtime: create → save and apply (painted with Texuli's runtime) → reload
 * (restored from the stored document) → delete.
 */

const NAMESPACE = 'ds-studio-fixture';

const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
  flushSync();
};

let handle: DevtoolsHandle | undefined;
const runtimes: ProtoyardRuntime[] = [];
const unbinds: (() => void)[] = [];
afterEach(async () => {
  for (const unbind of unbinds.splice(0)) unbind();
  await handle?.destroy();
  handle = undefined;
  for (const runtime of runtimes.splice(0)) runtime.close();
  localStorage.clear();
  forgetDesignSystemTheme('harbor-ds');
  document.body.replaceChildren();
  document.documentElement.removeAttribute('data-tx-ds');
});

function storage() {
  const indexedDB = new IDBFactory() as unknown as globalThis.IDBFactory;
  const definition = createTasksDefinition({ namespace: NAMESPACE });
  return async () => {
    const runtime = await createPrototypeRuntime(definition, {
      indexedDB,
      IDBKeyRange,
      themes: BUILTIN_THEMES,
      sleep: async () => {},
    });
    await runtime.scenarios.ensureSeeded();
    runtimes.push(runtime);
    // What the renderer does in a prototype: paint the root on every appearance change.
    unbinds.push(bindAppearance(runtime, BUILTIN_THEMES));
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
  await fireEvent.click(within(panel).getByRole('button', { name: 'Open studio' }));
  await waitFor(() => expect(within(panel).getByTestId('design-system-studio')).toBeTruthy());
  return panel;
}

const type = async (element: HTMLElement, value: string) => {
  await fireEvent.input(element, { target: { value } });
  await settle();
};

describe('Design systems in Theme Studio', () => {
  it('creates a design system, applies it with Texuli runtime and restores it after a reload', async () => {
    const open = storage();
    const runtime = await open();
    const panel = await openStudio(runtime);
    const studio = within(within(panel).getByTestId('design-system-studio'));

    await type(studio.getByLabelText('Design system name'), 'Harbor DS');
    await type(studio.getByLabelText('Brand color (hex)'), '#0f766e');
    await fireEvent.click(studio.getByRole('radio', { name: 'Compact' }));
    await fireEvent.click(studio.getByRole('button', { name: 'Create design system' }));
    await waitFor(() =>
      expect(studio.getByTestId('ds-report').textContent).toContain('harbor-ds@1.0.0')
    );
    expect(studio.getByTestId('ds-report').textContent).toMatch(
      /light: (\d+)\/\1 contrast pairs pass/
    );

    await fireEvent.click(studio.getByRole('button', { name: 'Save and apply' }));
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-tx-ds')).toBe('harbor-ds')
    );
    expect(runtime.theme.appearance().theme.value).toBe('harbor-ds');
    expect(hasDesignSystemPainter('harbor-ds')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--tx-density')).toBe('0.875');
    expect(Object.keys(readStoredDesignSystems(NAMESPACE))).toEqual(['harbor-ds']);

    // Reload: a new runtime over the same database, and no painter in memory.
    await handle?.destroy();
    handle = undefined;
    unbinds.shift()?.();
    runtime.close();
    forgetDesignSystemTheme('harbor-ds');
    document.documentElement.removeAttribute('data-tx-ds');
    const reloaded = await open();
    expect(reloaded.theme.appearance().theme.value).toBe('harbor-ds');
    expect(document.documentElement.hasAttribute('data-tx-ds')).toBe(false);
    expect(await restoreDesignSystems(reloaded)).toEqual(['harbor-ds']);
    expect(hasDesignSystemPainter('harbor-ds')).toBe(true);
    // The registered design system repaints the root that already shows its theme.
    expect(document.documentElement.getAttribute('data-tx-ds')).toBe('harbor-ds');
  });

  it('drops a stored document Texuli refuses, or one whose theme was deleted', async () => {
    const runtime = await storage()();
    storeDesignSystem(NAMESPACE, {
      format: 'texuli/design-system',
      formatVersion: 1,
      id: 'orphan',
      version: '1.0.0',
      name: 'Orphan',
      color: { brand: { seed: '#0f766e' } },
    });
    localStorage.setItem(
      `protoyard:design-systems:${NAMESPACE}`,
      JSON.stringify({
        ...readStoredDesignSystems(NAMESPACE),
        tampered: {
          format: 'texuli/design-system',
          formatVersion: 1,
          id: 'tampered',
          version: '1.0.0',
          name: 'Tampered',
          color: { brand: { seed: '#0f766e' } },
          assets: { logo: { light: 'https://tracker.example/x.svg' } },
        },
      })
    );
    expect(await restoreDesignSystems(runtime)).toEqual([]);
    expect(readStoredDesignSystems(NAMESPACE)).toEqual({});
    expect(hasDesignSystemPainter('orphan')).toBe(false);
    expect(hasDesignSystemPainter('tampered')).toBe(false);
  });

  it('shows Texuli refusals for pasted JSON and never applies it', async () => {
    const runtime = await storage()();
    const panel = await openStudio(runtime);
    const studio = within(within(panel).getByTestId('design-system-studio'));
    await type(
      studio.getByLabelText('Design-system JSON'),
      JSON.stringify({
        format: 'texuli/design-system',
        formatVersion: 1,
        id: 'bad',
        version: '1.0.0',
        name: 'Bad',
        color: { brand: { seed: '#fff;}body{display:none' } },
      })
    );
    await fireEvent.click(studio.getByRole('button', { name: 'Check JSON' }));
    await waitFor(() =>
      expect(studio.getByTestId('ds-errors').textContent?.length).toBeGreaterThan(0)
    );
    expect(studio.queryByRole('button', { name: 'Save and apply' })).toBeNull();
    expect(document.documentElement.hasAttribute('data-tx-ds')).toBe(false);
  });
});
