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

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

function fixedNav(rect: { top: number; height: number }, position = 'fixed'): HTMLElement {
  const nav = document.body.appendChild(document.createElement('nav'));
  nav.setAttribute('data-py-bottom-nav', '');
  nav.style.position = position;
  nav.getBoundingClientRect = () =>
    ({
      ...rect,
      bottom: rect.top + rect.height,
      left: 0,
      right: 390,
      width: 390,
      x: 0,
      y: rect.top,
    }) as DOMRect;
  return nav;
}

describe('the review toolbar on phones', () => {
  it('sits above a fixed bottom nav when no host placer runs', async () => {
    fixedNav({ top: window.innerHeight - 64, height: 64 });
    render(ReviewToolbar, { adapter, count: 1 });
    const bar = screen.getByRole('navigation', { name: 'Prototype review toolbar' });
    await waitFor(() => expect(bar.style.bottom).toBe('76px'));
  });

  it('measures the nav against the visible bottom of a smaller visual viewport', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    const viewport = Object.assign(new EventTarget(), {
      offsetLeft: 20,
      offsetTop: 0,
      width: window.innerWidth - 40,
      height: 600,
    });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    try {
      // A tab bar pinned to the visual bottom (600), not the layout bottom.
      fixedNav({ top: 540, height: 60 });
      render(ReviewToolbar, { adapter, count: 1 });
      const bar = screen.getByRole('navigation', { name: 'Prototype review toolbar' });
      await waitFor(() => expect(bar.style.bottom).toBe('72px'));
      await waitFor(() => expect(bar.style.getPropertyValue('--review-right-edge')).toBe('20px'));
    } finally {
      if (original) Object.defineProperty(window, 'visualViewport', original);
      else delete (window as { visualViewport?: unknown }).visualViewport;
    }
  });

  it('ignores a nav that is not fixed to the bottom, and leaves offsets to a host placer', async () => {
    fixedNav({ top: window.innerHeight - 64, height: 64 }, 'static');
    render(ReviewToolbar, { adapter, count: 1 });
    await nextFrame();
    await nextFrame();
    expect(screen.getByRole('navigation', { name: 'Prototype review toolbar' }).style.bottom).toBe(
      ''
    );
    cleanup();

    fixedNav({ top: window.innerHeight - 64, height: 64 });
    const place = vi.fn(() => ({ update: vi.fn(), destroy: vi.fn() }));
    render(ReviewToolbar, { adapter, count: 1, place });
    await nextFrame();
    await nextFrame();
    expect(screen.getByRole('navigation', { name: 'Prototype review toolbar' }).style.bottom).toBe(
      ''
    );
  });

  it('follows the visible right edge from the visual viewport and stays inside it', () => {
    const source = readFileSync(
      join(import.meta.dirname, '../src/toolbar/ReviewToolbar.svelte'),
      'utf8'
    );
    const rule = /\.review-toolbar\{([^}]*)\}/.exec(source)?.[1] ?? '';
    expect(rule).toContain('right:calc(.75rem + var(--review-right-edge,0px))');
    expect(rule).toContain('max-width:calc(100vw - 1.5rem - var(--review-right-edge,0px))');
  });

  it('keeps the action row in the DOM but hidden until opened, so aria-controls resolves', async () => {
    render(ReviewToolbar, { adapter, count: 1, onCommentModeChange: vi.fn() });
    const launcher = screen.getByRole('button', { name: 'Review: 1 comment thread' });
    const row = document.getElementById(launcher.getAttribute('aria-controls') ?? '');
    expect(row?.hidden).toBe(true);
    await fireEvent.click(launcher);
    expect(row?.hidden).toBe(false);
  });

  it('re-places the bar after the action row opens', async () => {
    const update = vi.fn();
    const place = vi.fn(() => ({ update, destroy: vi.fn() }));
    render(ReviewToolbar, { adapter, count: 1, place });
    await nextFrame();
    expect(update).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Review: 1 comment thread' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  });

  it('turns comment mode off from the launcher while pins are being placed', async () => {
    const onCommentModeChange = vi.fn();
    render(ReviewToolbar, { adapter, count: 2, commentMode: true, onCommentModeChange });
    const launcher = screen.getByRole('button', { name: 'Review: 2 comment threads' });
    expect(launcher.getAttribute('aria-expanded')).toBe('true');
    await fireEvent.click(launcher);
    expect(onCommentModeChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('opens the import picker with showPicker, falling back to a click', async () => {
    render(ReviewToolbar, { adapter, count: 0, expanded: true, onImport: vi.fn() });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('missing file input');
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    const showPicker = vi.fn();
    Object.defineProperty(input, 'showPicker', { configurable: true, value: showPicker });
    await fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(showPicker).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();

    showPicker.mockImplementation(() => {
      throw new DOMException('Not allowed', 'NotAllowedError');
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('uses a global visually-hidden rule for the Texuli file input', () => {
    const source = readFileSync(
      join(import.meta.dirname, '../src/toolbar/ReviewToolbar.svelte'),
      'utf8'
    );
    expect(source).toContain(':global(.review-toolbar__sr)');
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
