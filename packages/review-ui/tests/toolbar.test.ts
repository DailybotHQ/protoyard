import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountReview } from '../src/mount/index.ts';
import { createReviewOverlay } from '../src/overlay/index.ts';
import ReviewToolbar from '../src/toolbar/ReviewToolbar.svelte';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

const adapter = { info: () => ({ kind: 'local' as const, shared: false, live: false }) };

describe('the floating review toolbar never covers the app by default', () => {
  it('starts as one launcher; the actions open on demand and Escape closes them', async () => {
    const onCommentModeChange = vi.fn();
    render(ReviewToolbar, { adapter, count: 3, onCommentModeChange, onPanelChange: vi.fn() });
    const launcher = screen.getByRole('button', { name: 'Review: 3 comment threads' });
    expect(launcher.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Comment' })).toBeNull(); // hidden actions
    await fireEvent.click(launcher);
    expect(launcher.getAttribute('aria-expanded')).toBe('true');
    const comment = screen.getByRole('button', { name: 'Comment' });
    await fireEvent.click(comment);
    expect(onCommentModeChange).toHaveBeenCalledWith(true);
    comment.focus();
    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(launcher.getAttribute('aria-expanded')).toBe('false'));
    expect(document.activeElement).toBe(launcher);
  });

  it('stays open while commenting, so "Stop commenting" is always reachable', () => {
    render(ReviewToolbar, { adapter, count: 0, commentMode: true, onCommentModeChange: vi.fn() });
    expect(screen.getByRole('button', { name: 'Stop commenting' })).toBeTruthy();
  });

  it('hides the Comments button when DevTools hosts the panel, and has no dead Export/Import', async () => {
    render(ReviewToolbar, {
      adapter,
      count: 1,
      expanded: true,
      onPanelChange: vi.fn(),
      showPanelButton: false,
    });
    expect(screen.queryByRole('button', { name: 'Comments' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
  });

  it('lets the host place it, measuring only the launcher', () => {
    const destroy = vi.fn();
    const place = vi.fn((_el: HTMLElement, _options: { handle: () => HTMLElement | null }) => ({
      update: vi.fn(),
      destroy,
    }));
    const { unmount } = render(ReviewToolbar, { adapter, count: 2, place });
    expect(place).toHaveBeenCalledTimes(1);
    const [element, options] = place.mock.calls[0] as [
      HTMLElement,
      { handle: () => HTMLElement | null },
    ];
    expect(element.getAttribute('aria-label')).toBe('Prototype review toolbar');
    expect(options.handle()?.getAttribute('aria-label')).toBe('Review: 2 comment threads');
    unmount();
    expect(destroy).toHaveBeenCalled();
  });
});

describe('the overlay inside a review session', () => {
  it('draws no button of its own when the host has a toolbar, and is a labelled group', () => {
    const root = document.body.appendChild(document.createElement('main'));
    const overlay = createReviewOverlay({ root, onPlace: vi.fn(), toggle: false });
    const layer = document.querySelector('[data-py-review-overlay]');
    expect(layer?.getAttribute('role')).toBe('group');
    expect(document.querySelector('[data-py-review-toggle]')).toBeNull();
    // Comment mode still works from the host (and C).
    overlay.setActive(true);
    expect(document.querySelector('[data-py-review-capture]')).not.toBeNull();
    overlay.destroy();
  });
});

describe('mountReview with DevTools', () => {
  it('returns a lazy Comments tab whose props follow the session', async () => {
    const root = document.body.appendChild(document.createElement('main'));
    const definition = {
      manifest: {
        slug: 'toolbar-test',
        storage: { namespace: 'toolbar-test' },
        build: { review: { enabled: true, adapter: 'local' } },
      },
    } as never;
    const runtime = {
      theme: {
        appearance: () => ({
          shell: { value: 'none' },
          theme: { value: 'violet' },
          mode: { value: 'light' },
        }),
      },
      scenarios: { active: () => null },
      session: { principal: () => null },
    } as never;
    const review = await mountReview({ definition, runtime, root, devtools: true });
    const tab = review.devtoolsTab;
    expect(tab).toMatchObject({ id: 'review-comments', label: 'Comments' });
    expect(typeof (await tab?.load())).toBe('function'); // the ReviewPanel component, loaded on demand
    const props = tab?.props as { comments: unknown[]; focusThread?: unknown };
    expect(typeof props.focusThread).toBe('function');
    // No floating "Comments" button: DevTools hosts the panel.
    await fireEvent.click(screen.getByRole('button', { name: /^Review: 0 comment threads/ }));
    flushSync();
    expect(screen.getByRole('button', { name: 'Comment' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Comments' })).toBeNull();
    await review.destroy();
  });
});

describe('ReviewToolbar fallback position', () => {
  // Unit tests load no component CSS, so the rule is checked at its source.
  const css = readFileSync(
    join(import.meta.dirname, '../src/toolbar/ReviewToolbar.svelte'),
    'utf8'
  );
  const rule = css.match(/\.review-toolbar\{[^}]*\}/)?.[0] ?? '';

  it('stays inside the visible right edge until placeFloating positions it', () => {
    expect(rule).toContain('right:calc(.75rem + var(--py-fixed-right-edge,0px))');
    expect(rule).toContain('max-width:calc(100vw - 1.5rem - var(--py-fixed-right-edge,0px))');
  });
});
