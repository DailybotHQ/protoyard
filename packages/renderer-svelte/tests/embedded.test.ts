import type { PrototypeRuntime, Shell } from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { noFlashScript } from '@protoyard/themes';
import { cleanup, screen } from '@testing-library/svelte';
import type { Dexie } from 'dexie';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The runtime's own test prototype: a real world generator and Dexie schema.
import { createTasksDefinition } from '../../runtime/tests/fixtures/tasks-prototype.ts';
import { mountPrototype } from '../src/index.ts';
import { applyBuildInfo } from '../src/mount.ts';
import { keepsFrameWhenEmbedded, requestedShell } from '../src/shell/frame-mode.ts';
import { SHELL_CSS_MARKER } from '../src/shell/frames/registry.ts';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';
import ProbeApp from './fixtures/ProbeApp.svelte';

/*
 * A prototype shared as a Claude artifact runs framed in the viewer, and its
 * storage can be blocked or empty (previews, private windows). ADR-026.
 */

const root = document.documentElement;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  root.style.setProperty(SHELL_CSS_MARKER, '1');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  root.removeAttribute('style');
  root.className = '';
  for (const key of Object.keys(root.dataset)) delete root.dataset[key];
});

/** Just the runtime fields the embedded-frame rule reads. */
function decisionRuntime(options: {
  frameWhenEmbedded: boolean;
  override?: Shell;
  scenario?: Shell;
  manifest?: Shell;
}): PrototypeRuntime {
  return {
    manifest: {
      build: { frameWhenEmbedded: options.frameWhenEmbedded },
      preview: options.manifest ? { shell: options.manifest } : {},
    },
    overrides: { get: () => (options.override ? { shell: options.override } : {}) },
    scenarios: {
      active: () =>
        options.scenario ? { scenario: { appearance: { shell: options.scenario } } } : null,
    },
  } as unknown as PrototypeRuntime;
}

describe('embedded frames (build.frameWhenEmbedded)', () => {
  it('resolves the requested shell: override, then scenario, then manifest, then auto', () => {
    expect(requestedShell(decisionRuntime({ frameWhenEmbedded: true }))).toBe('auto');
    expect(requestedShell(decisionRuntime({ frameWhenEmbedded: true, manifest: 'phone' }))).toBe(
      'phone'
    );
    expect(
      requestedShell(
        decisionRuntime({ frameWhenEmbedded: true, manifest: 'phone', scenario: 'tablet' })
      )
    ).toBe('tablet');
    expect(
      requestedShell(
        decisionRuntime({
          frameWhenEmbedded: true,
          manifest: 'phone',
          scenario: 'tablet',
          override: 'browser',
        })
      )
    ).toBe('browser');
  });

  it('keeps a frame only for an explicit shell in a build that opts in', () => {
    expect(
      keepsFrameWhenEmbedded(decisionRuntime({ frameWhenEmbedded: true, manifest: 'phone' }))
    ).toBe(true);
    expect(
      keepsFrameWhenEmbedded(decisionRuntime({ frameWhenEmbedded: false, manifest: 'phone' }))
    ).toBe(false);
    expect(keepsFrameWhenEmbedded(decisionRuntime({ frameWhenEmbedded: true }))).toBe(false);
    expect(
      keepsFrameWhenEmbedded(decisionRuntime({ frameWhenEmbedded: true, manifest: 'auto' }))
    ).toBe(false);
  });

  async function bootEmbedded(frameWhenEmbedded: boolean) {
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);
    const runtime = createFakeRuntime();
    (runtime.manifest.build as { frameWhenEmbedded: boolean }).frameWhenEmbedded =
      frameWhenEmbedded;
    const target = document.body.appendChild(document.createElement('div'));
    const mounted = await mountPrototype({
      definition: runtime.definition,
      App: ProbeApp,
      target,
      search: '',
      devtools: false,
      createRuntime: () => runtime,
    });
    return { runtime, target, mounted };
  }

  it('draws an explicit frame in an iframe when the build opts in', async () => {
    const { runtime, target, mounted } = await bootEmbedded(true);
    try {
      await runtime.theme.setOverride({ shell: 'phone' });
      flushSync();
      await tick();
      await vi.waitFor(() =>
        expect(target.querySelector('[data-py-frame="phone"]')).not.toBeNull()
      );
      expect(root.dataset.pyShell).toBe('phone');
    } finally {
      await mounted.destroy();
    }
  });

  it('stays full-bleed in an iframe without the flag, and for auto even with it', async () => {
    const plain = await bootEmbedded(false);
    try {
      await plain.runtime.theme.setOverride({ shell: 'phone' });
      flushSync();
      await tick();
      expect(root.dataset.pyShell).toBeUndefined();
      expect(plain.target.querySelector('[data-py-frame]')).toBeNull();
    } finally {
      await plain.mounted.destroy();
    }
    document.body.replaceChildren();
    const opted = await bootEmbedded(true);
    try {
      await opted.runtime.theme.setOverride({ shell: 'auto' });
      flushSync();
      await tick();
      expect(root.dataset.pyShell).toBeUndefined();
    } finally {
      await opted.mounted.destroy();
    }
  });
});

describe('the artifact build flag', () => {
  const definition = createFakeRuntime().definition;

  it('turns on frameWhenEmbedded when the build baked it in (export --target artifact)', () => {
    expect(definition.manifest.build.frameWhenEmbedded).toBe(false);
    const applied = applyBuildInfo(definition, { namespace: 'fake', frameWhenEmbedded: true });
    expect(applied.manifest.build.frameWhenEmbedded).toBe(true);
    expect(applied.manifest.storage).toEqual(definition.manifest.storage);
    expect(definition.manifest.build.frameWhenEmbedded).toBe(false);
  });

  it('keeps the definition unchanged without build info or the flag, and still renames storage', () => {
    expect(applyBuildInfo(definition, null)).toBe(definition);
    expect(applyBuildInfo(definition, { namespace: 'fake', frameWhenEmbedded: false })).toBe(
      definition
    );
    const demo = applyBuildInfo(definition, { namespace: 'template-demo-fake' });
    expect(demo.manifest.storage.namespace).toBe('template-demo-fake');
    expect(demo.manifest.build.frameWhenEmbedded).toBe(false);
  });
});

/** An IndexedDB that refuses to open, as a private window or blocked site data does. */
function blockedIndexedDB(name = 'SecurityError'): IDBFactory {
  const refuse = () => {
    throw new DOMException('Access to IndexedDB is denied in this context.', name);
  };
  return {
    open: refuse,
    deleteDatabase: refuse,
    databases: refuse,
    cmp: () => 0,
  } as unknown as IDBFactory;
}

/** Makes every `localStorage` access throw, as blocked site data does in some browsers. */
function blockLocalStorage() {
  return vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
}

describe('blocked storage in an artifact view', () => {
  it('boots from memory with the storage warning when IndexedDB and localStorage are blocked', async () => {
    blockLocalStorage();
    const definition = createTasksDefinition({ namespace: 'artifact-blocked' });
    const target = document.body.appendChild(document.createElement('div'));
    const mounted = await mountPrototype({
      definition,
      App: ProbeApp,
      target,
      search: '',
      devtools: false,
      createRuntime: (def, options) =>
        createPrototypeRuntime(def, {
          ...options,
          indexedDB: blockedIndexedDB(),
          sleep: async () => {},
        }),
    });
    try {
      expect(mounted.error).toBeNull();
      expect(root.dataset.pyReady).toBe('true');
      expect(mounted.runtime?.storage()).toMatchObject({ backend: 'memory', persistent: false });
      const banner = screen.getByRole('status', { name: '' });
      expect(banner.textContent).toContain("Changes won't be saved.");
      expect(banner.textContent).toContain('running from memory');
      // The default scenario still seeded a world in memory.
      expect(mounted.runtime?.scenarios.active()?.scenario.id).toBe(
        definition.manifest.defaultScenario
      );
      const db = mounted.runtime?.db as Dexie | undefined;
      expect(await db?.table('tasks').count()).toBeGreaterThan(0);
      // Appearance changes keep working (the no-flash cache write is skipped, not fatal).
      await mounted.runtime?.theme.setOverride({ mode: 'dark' });
      flushSync();
      expect(root.classList.contains('dark')).toBe(true);
    } finally {
      await mounted.destroy();
    }
  });

  it('runs the no-flash script without throwing when localStorage is blocked', () => {
    blockLocalStorage();
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: query.includes('dark') }) as MediaQueryList
    );
    const script = noFlashScript('artifact-blocked');
    // The same string the build inlines in <head>; evaluated here only to test it.
    expect(() => new Function(script)()).not.toThrow();
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.dataset.pyMode).toBe('dark');
  });
});
