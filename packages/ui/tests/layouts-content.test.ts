import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DashboardGridLayout from '../src/layouts/DashboardGridLayout.svelte';
import DocsLayout from '../src/layouts/DocsLayout.svelte';
import MasterDetailLayout from '../src/layouts/MasterDetailLayout.svelte';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function rawSnippet(html: string) {
  return createRawSnippet(() => ({ render: () => html }));
}

describe('MasterDetailLayout', () => {
  it('resizes the list with keyboard controls and persists its width', async () => {
    const storageKey = 'test-master-detail-width';
    localStorage.removeItem(storageKey);
    render(MasterDetailLayout, {
      list: rawSnippet('<div>Long list</div>'),
      detail: rawSnippet('<p>Selected detail</p>'),
      storageKey,
    });

    const splitter = screen.getByRole('separator', { name: 'Resize list panel' });
    expect(splitter.getAttribute('aria-valuenow')).toBe('360');
    await fireEvent.keyDown(splitter, { key: 'Home' });
    expect(splitter.getAttribute('aria-valuenow')).toBe('240');
    expect(localStorage.getItem(storageKey)).toBe('240');
    await fireEvent.keyDown(splitter, { key: 'End' });
    expect(splitter.getAttribute('aria-valuenow')).toBe('640');
    await fireEvent.keyDown(splitter, { key: 'ArrowLeft' });
    expect(splitter.getAttribute('aria-valuenow')).toBe('624');
    await fireEvent.pointerDown(splitter, { pointerId: 1, clientX: 400 });
    await fireEvent.pointerMove(splitter, { pointerId: 1, clientX: 420, buttons: 1 });
    expect(splitter.getAttribute('aria-valuenow')).toBe('420');
    await fireEvent.pointerUp(splitter, { pointerId: 1, clientX: 420 });
    expect(localStorage.getItem(storageKey)).toBe('420');
  });

  it('keeps the list DOM and scroll position when the route selects a detail', async () => {
    const listSnippet = rawSnippet(
      '<div data-testid="master-list-scroll" style="height:100px;overflow:auto">Items</div>'
    );
    const detailSnippet = rawSnippet('<p>Selected detail</p>');
    const view = render(MasterDetailLayout, {
      list: listSnippet,
      detail: detailSnippet,
      storageKey: 'test-master-detail-scroll',
    });
    const list = screen.getByTestId('master-list-scroll');
    list.scrollTop = 80;

    await view.rerender({
      list: listSnippet,
      detail: detailSnippet,
      storageKey: 'test-master-detail-scroll',
      detailActive: true,
    });

    expect(screen.getByTestId('master-list-scroll')).toBe(list);
    expect(list.scrollTop).toBe(80);
    expect(view.container.querySelector('[data-detail-active="true"]')).toBeTruthy();
    expect(screen.getByText('Selected detail')).toBeTruthy();
  });
});

describe('DashboardGridLayout', () => {
  it('renders responsive widget slots with one-to-four column span hints', () => {
    for (const span of [1, 2, 3, 4]) {
      const view = render(DashboardGridLayout, {
        children: rawSnippet(`<article data-span="${span}">Widget ${span}</article>`),
      });
      const grid = view.container.querySelector('[data-py-dashboard-grid]');
      expect(grid?.querySelector(`[data-span="${span}"]`)?.textContent).toBe(`Widget ${span}`);
      expect(view.container.querySelector('.dashboard-grid')).toBeTruthy();
      view.unmount();
    }
  });
});

describe('DocsLayout', () => {
  it('builds a live h2/h3 table of contents and updates its active heading', async () => {
    let observer: TestIntersectionObserver | undefined;
    class TestIntersectionObserver {
      private callback: IntersectionObserverCallback;
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        observer = this;
      }
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
      root = null;
      rootMargin = '';
      thresholds = [0];
      trigger(target: Element) {
        this.callback(
          [
            {
              target,
              isIntersecting: true,
              boundingClientRect: { top: 20 } as DOMRectReadOnly,
            } as IntersectionObserverEntry,
          ],
          this as unknown as IntersectionObserver
        );
      }
    }
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);

    const view = render(DocsLayout, {
      navigation: rawSnippet('<a href="#guide">Guide</a>'),
      children: rawSnippet('<div><h2>Getting started</h2><h3>First steps</h3></div>'),
    });

    await waitFor(() => expect(screen.getByRole('link', { name: 'First steps' })).toBeTruthy());
    const content = view.container.querySelector('main');
    expect(content).toBeTruthy();
    content?.insertAdjacentHTML('beforeend', '<h2>Next section</h2>');
    await waitFor(() => expect(screen.getByRole('link', { name: 'Next section' })).toBeTruthy());

    const nextHeading = content?.querySelector('#next-section');
    expect(nextHeading).toBeTruthy();
    if (nextHeading) observer?.trigger(nextHeading);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Next section' }).getAttribute('aria-current')).toBe(
        'location'
      )
    );
    expect(screen.getByRole('navigation', { name: 'Documentation sections' })).toBeTruthy();
  });
});
