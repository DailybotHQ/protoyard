import type { PrototypeRuntime } from '@protoyard/core';
import { createMemoryReviewAdapter } from '@protoyard/review/store';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReviewSession from '../src/mount/ReviewSession.svelte';
import { createReviewOverlay } from '../src/overlay/index.ts';

/*
 * The mounted review session floats one collapsed launcher (no docked bar and
 * no second "Add comment" button), and wires Export and Import only when the
 * local adapter's file functions are passed.
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

async function expand(): Promise<void> {
  await fireEvent.click(screen.getByRole('button', { name: /^Review: / }));
}

describe('review session', () => {
  it('reserves no page space and renders no overlay toggle', async () => {
    session();
    await waitFor(() => expect(document.querySelector('[data-py-review-overlay]')).not.toBeNull());
    expect(document.documentElement.hasAttribute('data-py-review')).toBe(false);
    expect(document.body.style.paddingTop).toBe('');
    expect(document.querySelector('[data-py-review-toggle]')).toBeNull();
    expect(
      document.querySelector('[data-py-review-toolbar]')?.getAttribute('data-py-review-toolbar')
    ).toBe('collapsed');
  });

  it('renders no Export or Import without the local adapter’s file functions', async () => {
    session();
    await expand();
    expect(screen.getByRole('button', { name: 'Comment' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('imports a comments file from the toolbar and confirms it in a status', async () => {
    const importComments = vi.fn(async () => 13);
    const exportComments = vi.fn(async () => new Blob(['{}'], { type: 'application/json' }));
    session({ importComments, exportComments });
    await expand();
    expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(
      false
    );
    expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(
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
  it('can leave out its own toggle (toggle: false) and is a named group', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const handle = createReviewOverlay({ root, onPlace: () => {}, toggle: false });
    expect(document.querySelector('[data-py-review-toggle]')).toBeNull();
    // A named group, so its label is allowed (axe aria-prohibited-attr).
    const overlay = document.querySelector('[data-py-review-overlay]');
    expect(overlay?.getAttribute('role')).toBe('group');
    expect(overlay?.getAttribute('aria-label')).toBe('Prototype review comments');
    handle.destroy();
  });
});
