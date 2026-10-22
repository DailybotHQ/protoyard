import type { DevtoolsTab } from '@protoyard/devtools';
import { cleanup } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTasksDefinition } from '../../runtime/tests/fixtures/tasks-prototype.ts';
import { mountPrototype } from '../src/index.ts';
import ProbeApp from './fixtures/ProbeApp.svelte';

const reviewTab = {
  id: 'review-comments',
  label: 'Comments',
  icon: (() => null) as unknown as DevtoolsTab['icon'],
  load: vi.fn(async () => ({})),
};
const mountReview = vi.fn(async (_options: { devtools?: boolean }) => ({
  devtoolsTab: reviewTab,
  destroy: vi.fn(async () => {}),
}));
const mountDevtools = vi.fn((_options: { extraTabs?: unknown[] }) => {
  return { destroy: vi.fn(async () => {}) };
});
vi.mock('@protoyard/review-ui/mount', () => ({ mountReview }));
vi.mock('@protoyard/devtools', () => ({ mountDevtools }));

afterEach(() => {
  cleanup();
  mountReview.mockClear();
  mountDevtools.mockClear();
  document.body.replaceChildren();
});

async function boot(options: {
  namespace: string;
  review?: boolean;
  devtoolsTabs?: readonly DevtoolsTab[];
}) {
  const definition = createTasksDefinition({ namespace: options.namespace });
  (definition.manifest.build as { review?: unknown }).review = {
    enabled: options.review ?? false,
    adapter: 'local',
  };
  const target = document.body.appendChild(document.createElement('div'));
  return mountPrototype({
    definition,
    App: ProbeApp,
    target,
    search: '',
    devtools: true,
    devtoolsTabs: options.devtoolsTabs,
  });
}

describe('prototype DevTools tabs', () => {
  it('passes contributed tabs to DevTools without mounting review', async () => {
    const studioTab = {
      id: 'deck-studio',
      label: 'Deck Studio',
      icon: (() => null) as unknown as DevtoolsTab['icon'],
      load: vi.fn(async () => ({})),
    } satisfies DevtoolsTab;
    const mounted = await boot({ namespace: 'devtools-tabs-a', devtoolsTabs: [studioTab] });

    expect(mountDevtools.mock.calls[0]?.[0].extraTabs).toEqual([studioTab]);
    expect(mountReview).not.toHaveBeenCalled();
    await mounted.destroy();
  });

  it('merges contributed tabs with the review tab', async () => {
    const studioTab = {
      id: 'deck-studio',
      label: 'Deck Studio',
      icon: (() => null) as unknown as DevtoolsTab['icon'],
      load: vi.fn(async () => ({})),
    } satisfies DevtoolsTab;
    const mounted = await boot({
      namespace: 'devtools-tabs-b',
      review: true,
      devtoolsTabs: [studioTab],
    });

    expect(mountDevtools.mock.calls[0]?.[0].extraTabs).toEqual([studioTab, reviewTab]);
    expect(mountReview).toHaveBeenCalledTimes(1);
    await mounted.destroy();
  });

  it('omits extraTabs when neither the prototype nor review contributes a tab', async () => {
    const mounted = await boot({ namespace: 'devtools-tabs-c' });

    expect(mountDevtools.mock.calls[0]?.[0].extraTabs).toBeUndefined();
    await mounted.destroy();
  });
});
