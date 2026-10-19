// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createArtifactShellReviewAdapter } from '../src/adapters/artifact-shell.ts';
import { createMemoryReviewAdapter } from '../src/store/index.ts';
import { createFakeClaude } from './fixtures/fake-claude.ts';

describe('Artifact shell composer fallback', () => {
  it('uses comments-only mode when db is unavailable and opens only on an explicit call', async () => {
    const element = {} as Element;
    const openComposer = vi.fn();
    const uses: string[] = [];
    const fallback = createMemoryReviewAdapter();
    const result = await createArtifactShellReviewAdapter(fallback, {
      async use(capability) {
        uses.push(capability);
        if (capability === 'comments') return { composer_only: true, openComposer };
        return null;
      },
    });

    expect(result.mode).toBe('composer_only');
    expect(result.adapter).toBe(fallback);
    expect(uses).toEqual(['db', 'user', 'comments']);
    expect(openComposer).not.toHaveBeenCalled();
    await expect(result.openComposer(element)).resolves.toBe(true);
    expect(openComposer).toHaveBeenCalledWith({ element });
  });

  it('uses the shared adapter when db and user are available', async () => {
    const fake = createFakeClaude();
    const result = await createArtifactShellReviewAdapter(createMemoryReviewAdapter(), {
      async use(capability) {
        if (capability === 'db') return fake.db;
        if (capability === 'user') return fake.user;
        throw new Error('comments should not be requested');
      },
    });

    expect(result.mode).toBe('shared');
    expect(result.adapter.info()).toMatchObject({ kind: 'artifact', shared: true });
    expect(await result.openComposer({} as Element)).toBe(false);
  });

  it('keeps local comments when the comments capability is not granted', async () => {
    const fallback = createMemoryReviewAdapter();
    const result = await createArtifactShellReviewAdapter(fallback, {
      async use(capability) {
        if (capability === 'comments')
          throw Object.assign(new Error('Not granted'), { code: 'not_granted' });
        return null;
      },
    });

    expect(result.mode).toBe('local');
    expect(result.adapter).toBe(fallback);
    expect(await result.openComposer({} as Element)).toBe(false);
  });
});
