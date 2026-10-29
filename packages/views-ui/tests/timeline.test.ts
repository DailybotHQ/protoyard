import type { TimelineItem } from '@protoyard/views/timeline';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { dateAtOffset, durationLabel, TimelineView, timelineRange } from '../src/timeline/index.ts';

afterEach(() => cleanup());

const TASKS: TimelineItem[] = [
  { id: 't1', start: '2026-10-20', end: '2026-10-22' },
  { id: 't2', start: '2026-10-22', end: '2026-10-25' },
];

describe('TimelineView (Texuli adapter)', () => {
  it('renders tasks from query', async () => {
    render(TimelineView, {
      query: { current: TASKS, loading: false, error: undefined },
      dependencies: [],
      now: new Date('2026-10-21T12:00:00Z'),
      getTitle: (t) => t.id,
    });
    await waitFor(() => expect(document.body.textContent).toMatch(/t1|t2|timeline|Project/i));
  });

  it('re-exports timeline math helpers', () => {
    expect(typeof durationLabel).toBe('function');
    expect(typeof dateAtOffset).toBe('function');
    expect(typeof timelineRange).toBe('function');
  });
});
