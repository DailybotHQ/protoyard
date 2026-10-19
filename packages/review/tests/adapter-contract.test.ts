import { describe, expect, it } from 'vitest';
import {
  acceptStoredComments,
  changedSince,
  createMemoryReviewAdapter,
  createStamper,
  type ReviewAdapter,
  sortReviewComments,
  watchReviewComments,
} from '../src/store/index.ts';
import { runAdapterConformance, sampleComment } from './conformance.ts';

// The reference adapter, live (subscribe) and as a polling-only backend.
runAdapterConformance('memory (live)', () => createMemoryReviewAdapter());
runAdapterConformance('memory (polling)', () => {
  const live = createMemoryReviewAdapter({ info: { kind: 'http', shared: true, live: false } });
  const { subscribe: _push, ...polling } = live;
  return polling as ReviewAdapter;
});

describe('store helpers', () => {
  it('stamps strictly increasing times even within one millisecond', () => {
    const stamp = createStamper(() => Date.parse('2026-10-19T10:00:00.000Z'));
    expect([stamp(), stamp(), stamp()]).toEqual([
      '2026-10-19T10:00:00.000Z',
      '2026-10-19T10:00:00.001Z',
      '2026-10-19T10:00:00.002Z',
    ]);
  });

  it('keeps only valid stored rows, sorts and filters by since', () => {
    const a = {
      ...sampleComment('demo-app', { id: 'aaaaaaaaaaaa', threadId: 'aaaaaaaaaaaa' }),
      updatedAt: '2026-10-19T10:00:00.000Z',
    };
    const b = {
      ...sampleComment('demo-app', {
        id: 'bbbbbbbbbbbb',
        threadId: 'bbbbbbbbbbbb',
        createdAt: '2026-10-19T08:00:00.000Z',
      }),
    };
    const valid = acceptStoredComments([a, { id: 'junk' }, null, '<script>', b]);
    expect(valid.map((c) => c.id)).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
    expect(sortReviewComments(valid).map((c) => c.id)).toEqual(['bbbbbbbbbbbb', 'aaaaaaaaaaaa']);
    expect(changedSince(valid[0] as never, '2026-10-19T09:59:59.000Z')).toBe(true);
    expect(changedSince(valid[0] as never, '2026-10-19T10:00:00.000Z')).toBe(false);
    expect(changedSince(valid[1] as never, undefined)).toBe(true); // no stamp: createdAt
  });

  it('copies on read, so callers cannot change stored comments', async () => {
    const adapter = createMemoryReviewAdapter();
    const stored = await adapter.put(sampleComment('demo-app'));
    stored.body = 'mutated';
    const [again] = await adapter.list('demo-app');
    expect(again?.body).toBe('The total looks off on this card.');
  });

  it('keeps polling through failures and stops cleanly', async () => {
    let calls = 0;
    const flaky: ReviewAdapter = {
      list: async () => {
        calls++;
        if (calls === 2) throw new Error('offline');
        return [];
      },
      put: async () => {
        throw new Error('unused');
      },
      remove: async () => {},
      info: () => ({ kind: 'http', shared: true, live: false }),
    };
    const stop = watchReviewComments(flaky, 'demo-app', () => {}, { intervalMs: 10 });
    await expect.poll(() => calls, { timeout: 1000 }).toBeGreaterThan(3);
    stop();
    const after = calls;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(calls).toBeLessThanOrEqual(after + 1);
  });
});
