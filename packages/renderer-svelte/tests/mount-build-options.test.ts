import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyBuildOptions, type MountPrototypeOptions, mountPrototype } from '../src/mount.ts';
import { SHELL_CSS_MARKER } from '../src/shell/frames/registry.ts';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';
import ProbeApp from './fixtures/ProbeApp.svelte';

const devtools = vi.hoisted(() => ({ mountDevtools: vi.fn(() => ({ destroy: vi.fn() })) }));
const review = vi.hoisted(() => ({
  mountReview: vi.fn(async () => ({ devtoolsTab: undefined, destroy: vi.fn() })),
}));
vi.mock('@protoyard/devtools', () => devtools);
vi.mock('@protoyard/review-ui/mount', () => review);

const root = document.documentElement;

beforeEach(() => {
  root.style.setProperty(SHELL_CSS_MARKER, '1');
});

describe('applyBuildOptions', () => {
  const definition = createFakeRuntime().definition;

  it('returns the definition unchanged without options or with matching values', () => {
    expect(applyBuildOptions(definition, undefined)).toBe(definition);
    expect(applyBuildOptions(definition, {})).toBe(definition);
    expect(
      applyBuildOptions(definition, {
        namespace: definition.manifest.storage.namespace,
        frameWhenEmbedded: definition.manifest.build.frameWhenEmbedded,
      })
    ).toBe(definition);
  });

  it('renames storage and sets frameWhenEmbedded in both directions, without mutating', () => {
    const applied = applyBuildOptions(definition, {
      namespace: 'bp-abc123',
      frameWhenEmbedded: true,
    });
    expect(applied.manifest.storage).toEqual({
      ...definition.manifest.storage,
      namespace: 'bp-abc123',
    });
    expect(applied.manifest.build.frameWhenEmbedded).toBe(true);
    expect(definition.manifest.storage.namespace).not.toBe('bp-abc123');
    expect(definition.manifest.build.frameWhenEmbedded).toBe(false);

    const off = applyBuildOptions(applied, { frameWhenEmbedded: false });
    expect(off.manifest.build.frameWhenEmbedded).toBe(false);
    expect(off.manifest.storage.namespace).toBe('bp-abc123');
  });

  it('rejects a namespace that is not a valid manifest namespace', () => {
    for (const namespace of ['', 'A', 'has space', '../x', '1abc', 'x'.repeat(65)]) {
      expect(() => applyBuildOptions(definition, { namespace }), namespace).toThrow();
    }
  });
});

describe('mountPrototype build options', () => {
  let destroy: (() => Promise<void>) | undefined;
  async function teardown() {
    await destroy?.();
    destroy = undefined;
  }
  afterEach(async () => {
    await teardown();
    document.body.replaceChildren();
    root.removeAttribute('style');
    vi.unstubAllGlobals();
    devtools.mountDevtools.mockClear();
    review.mountReview.mockClear();
  });

  async function boot(options: Partial<MountPrototypeOptions> = {}) {
    const target = document.body.appendChild(document.createElement('div'));
    const runtime = createFakeRuntime();
    const created: { namespace?: string; frameWhenEmbedded?: boolean } = {};
    const mounted = await mountPrototype({
      definition: runtime.definition,
      App: ProbeApp,
      target,
      search: '',
      createRuntime: (definition) => {
        created.namespace = definition.manifest.storage.namespace;
        created.frameWhenEmbedded = definition.manifest.build.frameWhenEmbedded;
        return runtime;
      },
      ...options,
    });
    destroy = mounted.destroy;
    return { mounted, runtime, target, created };
  }

  it('keeps today’s defaults when no build options are passed', async () => {
    const { mounted, runtime, created } = await boot();
    expect(mounted.error).toBeNull();
    expect(created.namespace).toBe(runtime.definition.manifest.storage.namespace);
    expect(created.frameWhenEmbedded).toBe(false);
    // Undeclared defines (tests): DevTools are allowed only when asked; no review, no badge.
    expect(devtools.mountDevtools).not.toHaveBeenCalled();
    expect(review.mountReview).not.toHaveBeenCalled();
    expect(document.querySelector('[data-py-demo-badge]')).toBeNull();
  });

  it('hands the runtime the namespace and frame flag from build options', async () => {
    const { created } = await boot({
      build: { namespace: 'bp-player-one', frameWhenEmbedded: true },
    });
    expect(created).toEqual({ namespace: 'bp-player-one', frameWhenEmbedded: true });
  });

  it('shows the recovery screen, not a blank page, for an invalid namespace', async () => {
    const create = vi.fn();
    const { mounted, target } = await boot({
      build: { namespace: 'Not Valid' },
      createRuntime: create,
    });
    expect(create).not.toHaveBeenCalled();
    expect(mounted.runtime).toBeNull();
    expect(mounted.error).toBeTruthy();
    expect(root.dataset.pyReady).toBe('error');
    expect(target.textContent).not.toBe('');
  });

  it('turns DevTools on and off at mount time, over the top-level option', async () => {
    await boot({ build: { devtools: true } });
    expect(devtools.mountDevtools).toHaveBeenCalledTimes(1);
    await teardown();

    await boot({ devtools: true, build: { devtools: false } });
    expect(devtools.mountDevtools).toHaveBeenCalledTimes(1);
  });

  it('cannot add DevTools to a build compiled without them', async () => {
    vi.stubGlobal('__PROTOYARD_DEVTOOLS__', false);
    await boot({ build: { devtools: true } });
    expect(devtools.mountDevtools).not.toHaveBeenCalled();
  });

  it('turns review on when the build leaves it undeclared, and off over a built-in review', async () => {
    await boot({ build: { review: true } });
    expect(review.mountReview).toHaveBeenCalledTimes(1);
    await teardown();

    vi.stubGlobal('__PROTOYARD_REVIEW__', true);
    await boot({ build: { review: false } });
    expect(review.mountReview).toHaveBeenCalledTimes(1);
    await teardown();

    await boot();
    expect(review.mountReview).toHaveBeenCalledTimes(2);
  });

  it('cannot add review to a build compiled without it', async () => {
    vi.stubGlobal('__PROTOYARD_REVIEW__', false);
    await boot({ build: { review: true } });
    expect(review.mountReview).not.toHaveBeenCalled();
  });

  it('shows the demo badge from build options over the top-level option', async () => {
    await boot({ demoBadge: false, build: { demoBadge: true } });
    expect(screen.getByTestId('who')).toBeTruthy();
    expect(document.querySelector('[data-py-demo-badge]')).not.toBeNull();
    await teardown();
    document.body.replaceChildren();

    await boot({ demoBadge: true, build: { demoBadge: false } });
    expect(document.querySelector('[data-py-demo-badge]')).toBeNull();
  });

  it('keeps both defines inline so builds without DevTools or review fold the imports away', () => {
    const source = readFileSync(join(import.meta.dirname, '../src/mount.ts'), 'utf8');
    expect(source).toMatch(
      /typeof __PROTOYARD_DEVTOOLS__ !== 'undefined' \? __PROTOYARD_DEVTOOLS__ : true/
    );
    expect(source).toMatch(/\? __PROTOYARD_REVIEW__ && build\?\.review !== false/);
  });
});
