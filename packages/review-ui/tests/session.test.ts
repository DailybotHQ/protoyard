import type { PrototypeRuntime } from '@protoyard/core';
import { createMemoryReviewAdapter } from '@protoyard/review/store';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReviewSession from '../src/mount/ReviewSession.svelte';
import { createReviewOverlay } from '../src/overlay/index.ts';

/*
 * The mounted review session docks its toolbar (html[data-py-review]) so it
 * takes real space instead of covering the app, hides the overlay's second
 * "Add comment" button, and wires Export and Import for the local adapter.
 */
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const runtime = {} as PrototypeRuntime;

function session(extra: Record<string, unknown> = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  return render(ReviewSession, {
    adapter: createMemoryReviewAdapter(),
    runtime,
    root,
    slug: 'demo-app',
    clientId: 'test-client-0001',
    ...extra,
  });
}

describe('review session', () => {
  it('docks the toolbar while mounted and hides the overlay’s own toggle', async () => {
    const view = session();
    await waitFor(() => expect(document.documentElement.hasAttribute('data-py-review')).toBe(true));
    const toggle = document.querySelector<HTMLButtonElement>('[data-py-review-toggle]');
    expect(toggle?.hidden).toBe(true);
    view.unmount();
    expect(document.documentElement.hasAttribute('data-py-review')).toBe(false);
  });

  it('keeps Export and Import off without the local adapter’s file functions', () => {
    session();
    expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('imports a comments file from the toolbar and confirms it in a status', async () => {
    const importComments = vi.fn(async () => 13);
    const exportComments = vi.fn(async () => new Blob(['{}'], { type: 'application/json' }));
    session({ importComments, exportComments });
    expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(
      false
    );
    const input = document.querySelector<HTMLInputElement>(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(['{"format":"protoyard-review-comments"}'], 'review.json', {
      type: 'application/json',
    });
    await fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(importComments).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.body.textContent).toContain('Imported 13 comments.'));
  });
});

describe('review overlay', () => {
  it('can hide its own toggle (showToggle: false)', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const handle = createReviewOverlay({ root, onPlace: () => {}, showToggle: false });
    expect(document.querySelector<HTMLButtonElement>('[data-py-review-toggle]')?.hidden).toBe(true);
    // A named group, so its label is allowed (axe aria-prohibited-attr).
    const overlay = document.querySelector('[data-py-review-overlay]');
    expect(overlay?.getAttribute('role')).toBe('group');
    expect(overlay?.getAttribute('aria-label')).toBe('Prototype review comments');
    handle.destroy();
  });
});
