import { cleanup } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTasksDefinition } from '../../runtime/tests/fixtures/tasks-prototype.ts';
import { mountPrototype } from '../src/index.ts';
import { placeFloating } from '../src/shell/floating.ts';
import ProbeApp from './fixtures/ProbeApp.svelte';

/**
 * Review comments and DevTools together: review mounts first, so DevTools can
 * host its "Comments" tab, and the floating toolbar gets the renderer's
 * placement (the demo badge's rules). Both lazy modules are mocked.
 */

const calls: string[] = [];
const tab = {
  id: 'review-comments',
  label: 'Comments',
  icon: () => null,
  load: vi.fn(),
  props: {},
};
const mountReview = vi.fn(async (options: { devtools?: boolean }) => {
  calls.push('review');
  return {
    adapter: {},
    ...(options.devtools ? { devtoolsTab: tab } : {}),
    destroy: vi.fn(async () => {}),
  };
});
const mountDevtools = vi.fn((_options: { extraTabs?: unknown[] }) => {
  calls.push('devtools');
  return { destroy: vi.fn(async () => {}) };
});
vi.mock('@protoyard/review-ui/mount', () => ({ mountReview }));
vi.mock('@protoyard/devtools', () => ({ mountDevtools }));

afterEach(() => {
  cleanup();
  calls.length = 0;
  mountReview.mockClear();
  mountDevtools.mockClear();
  document.body.replaceChildren();
});

async function boot(options: { review: boolean; devtools: boolean; namespace: string }) {
  const definition = createTasksDefinition({ namespace: options.namespace });
  (definition.manifest.build as { review?: unknown }).review = {
    enabled: options.review,
    adapter: 'local',
  };
  const target = document.body.appendChild(document.createElement('div'));
  return mountPrototype({
    definition,
    App: ProbeApp,
    target,
    search: '',
    devtools: options.devtools,
  });
}

describe('review comments wiring', () => {
  it('mounts review before DevTools and registers its Comments tab', async () => {
    const mounted = await boot({ review: true, devtools: true, namespace: 'review-wiring-a' });
    expect(calls).toEqual(['review', 'devtools']);
    expect(mountReview.mock.calls[0]?.[0]).toMatchObject({ devtools: true, place: placeFloating });
    expect(mountDevtools.mock.calls[0]?.[0].extraTabs).toEqual([tab]);
    await mounted.destroy();
  });

  it('keeps the toolbar panel when there is no DevTools, and registers no tab', async () => {
    const mounted = await boot({ review: true, devtools: false, namespace: 'review-wiring-b' });
    expect(calls).toEqual(['review']);
    expect(mountReview.mock.calls[0]?.[0]).toMatchObject({ devtools: false });
    await mounted.destroy();
  });

  it('mounts DevTools without extra tabs when review is off', async () => {
    const mounted = await boot({ review: false, devtools: true, namespace: 'review-wiring-c' });
    expect(calls).toEqual(['devtools']);
    expect(mountDevtools.mock.calls[0]?.[0].extraTabs).toBeUndefined();
    await mounted.destroy();
  });
});
