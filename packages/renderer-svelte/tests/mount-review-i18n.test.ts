import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountPrototype } from '../src/index.ts';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';
import ProbeApp from './fixtures/ProbeApp.svelte';

const mountReview = vi.fn(async (_options: Record<string, unknown>) => ({
  devtoolsTab: undefined,
  destroy: () => {},
}));
vi.mock('@protoyard/review-ui/mount', () => ({ mountReview }));

describe('mountPrototype review labels (Corag UG-06)', () => {
  let destroy: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await destroy?.();
    document.body.replaceChildren();
  });

  it('hands the prototype dictionary to the review UI, which mounts its own roots', async () => {
    const runtime = createFakeRuntime();
    const i18n = { labels: { 'protoyard.review.tab': 'Comentarios' }, locale: 'es' };
    const mounted = await mountPrototype({
      definition: runtime.definition,
      App: ProbeApp,
      target: document.body.appendChild(document.createElement('div')),
      search: '',
      devtools: false,
      build: { review: true },
      i18n,
      createRuntime: () => runtime,
    });
    destroy = mounted.destroy;
    await vi.waitFor(() => expect(mountReview).toHaveBeenCalled());
    expect(mountReview.mock.calls[0]?.[0]).toMatchObject({ i18n });
  });
});
