// @vitest-environment happy-dom
import type { ReviewComment } from '@protoyard/core/review';
import { createAnchor } from '@protoyard/review/anchors';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReviewOverlay } from '../src/overlay/index.ts';

/** The overlay's callbacks for a review session: comment-mode changes and orphaned threads. */

afterEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
});

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

function thread(id: string, element: Element): ReviewComment {
  return {
    formatVersion: 1,
    id,
    threadId: id,
    slug: 'invoice-demo',
    body: 'Check this row.',
    author: { name: 'Alex Reviewer', clientId: 'client_12345678' },
    createdAt: '2026-10-19T12:00:00Z',
    anchor: createAnchor(
      element,
      { x: 10, y: 10 },
      { root: document.querySelector('main') as Element }
    ),
    context: { viewport: { width: 1280, height: 800 } },
  };
}

describe('overlay callbacks for a review session', () => {
  it('reports every comment-mode change, including Escape and C', () => {
    const root = document.body.appendChild(document.createElement('main'));
    const onActiveChange = vi.fn();
    const overlay = createReviewOverlay({ root, onPlace: vi.fn(), toggle: false, onActiveChange });
    overlay.setActive(true);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
    overlay.setActive(true); // no change: no call
    expect(onActiveChange.mock.calls.map((call) => call[0])).toEqual([true, false, true]);
    overlay.destroy();
  });

  it('lists threads whose element disappeared from the app as orphaned', async () => {
    const root = document.body.appendChild(document.createElement('main'));
    const row = root.appendChild(document.createElement('button'));
    row.id = 'account-acme';
    row.textContent = 'Acme Corp';
    const onOrphans = vi.fn();
    const overlay = createReviewOverlay({ root, onPlace: vi.fn(), toggle: false, onOrphans });
    overlay.setComments([thread('review_1', row)]);
    expect(onOrphans).not.toHaveBeenCalled(); // nothing orphaned yet: no call
    row.remove(); // a scenario switch replaced the data
    await nextFrame();
    await nextFrame();
    expect(onOrphans).toHaveBeenLastCalledWith(['review_1']);
    overlay.destroy();
  });
});
