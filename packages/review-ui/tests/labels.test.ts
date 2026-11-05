// @vitest-environment happy-dom

import type { ReviewComment } from '@protoyard/core/review';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createReviewOverlay } from '../src/overlay/index.ts';
import ReviewPanel from '../src/panel/ReviewPanel.svelte';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

const comments: ReviewComment[] = [
  {
    formatVersion: 1,
    id: 'thread_root_123456789',
    threadId: 'thread_root_123456789',
    slug: 'demo-app',
    body: 'Move this button.',
    author: { name: 'Alex Reviewer', clientId: 'review_123456789abcdef0' },
    createdAt: '2026-10-19T12:00:00Z',
    anchor: {
      route: { pattern: '/', path: '/' },
      locators: [{ kind: 'id', value: 'target' }],
      offset: { x: 0.5, y: 0.5 },
    },
  },
];

describe('review-ui labels (UG-06)', () => {
  it('keeps English without a dictionary', () => {
    render(ReviewPanel, { comments });
    expect(screen.getByRole('region', { name: 'Review comments' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Filter by screen' })).toBeTruthy();
  });

  it('applies the dictionary a host passes (the panel is its own Svelte root)', async () => {
    render(ReviewPanel, {
      comments,
      i18n: {
        locale: 'es',
        labels: {
          'protoyard.review.panel.label': 'Comentarios de revisión',
          'protoyard.review.panel.filter-screen': 'Filtrar por pantalla',
          'protoyard.review.panel.all-screens': 'Todas las pantallas',
        },
      },
    });
    expect(screen.getByRole('region', { name: 'Comentarios de revisión' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por pantalla' }));
    expect(await screen.findByRole('option', { name: 'Todas las pantallas' })).toBeTruthy();
  });

  it('the overlay takes a message lookup', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const handle = createReviewOverlay({
      root,
      onPlace: () => {},
      messages: (id, english) =>
        id === 'protoyard.review.overlay.add' ? 'Añadir comentario' : english,
    });
    const toggle = document.querySelector<HTMLButtonElement>('[data-py-review-toggle]');
    expect(toggle?.textContent).toBe('Añadir comentario');
    handle.destroy();
  });
});
