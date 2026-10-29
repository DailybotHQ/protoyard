import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SplitView } from '../src/index.ts';
import DocsLayout from '../src/layouts/DocsLayout.svelte';
import PageGrid from '../src/layouts/PageGrid.svelte';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function rawSnippet(html: string) {
  return createRawSnippet(() => ({ render: () => html }));
}

describe('PageGrid', () => {
  it('caps responsive columns, exposes an optional named region and prevents narrow child overflow', () => {
    render(PageGrid, {
      columns: 3,
      minItem: 280,
      gap: '1rem',
      label: 'Project cards',
      children: rawSnippet('<article data-testid="wide-card">Wide content</article>'),
    });
    const grid = screen.getByRole('region', { name: 'Project cards' });
    // Texuli's CardGrid: auto-fill columns of at least 280px, capped at three.
    expect(grid.hasAttribute('data-tx-card-grid')).toBe(true);
    expect(grid.getAttribute('data-columns')).toBe('3');
    expect(grid.getAttribute('data-max-columns')).toBe('3');
    expect(grid.style.gridTemplateColumns).toContain('280px');
    expect(grid.className).toContain('tx-card-grid--gap-md');
    expect(grid.className).toContain('min-w-0');
    expect(grid.className).toContain('[&>*]:min-w-0');
    const wideCard = grid.querySelector('[data-testid="wide-card"]');
    expect(wideCard).toBeTruthy();
  });
});

describe('SplitView', () => {
  it('names both panes and shows the caller-selected detail on narrow containers', async () => {
    const view = render(SplitView, {
      list: rawSnippet('<ul><li>Projects</li></ul>'),
      detail: rawSnippet('<article>Project details</article>'),
      listLabel: 'Projects',
      detailLabel: 'Selected project',
      detailActive: true,
    });
    expect(screen.getByRole('region', { name: 'Projects' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Selected project' })).toBeTruthy();
    expect(view.container.querySelector('[data-detail-active="true"]')).toBeTruthy();

    await view.rerender({
      list: rawSnippet('<ul><li>Projects</li></ul>'),
      detail: rawSnippet('<article>Project details</article>'),
      listLabel: 'Projects',
      detailLabel: 'Selected project',
      detailActive: false,
    });
    expect(view.container.querySelector('[data-detail-active="false"]')).toBeTruthy();
  });

  it('renders the empty detail state without hiding the list', () => {
    const view = render(SplitView, {
      list: rawSnippet('<ul><li>Projects</li></ul>'),
      empty: rawSnippet('<p>Choose a project</p>'),
      listLabel: 'Projects',
      detailLabel: 'Project details',
    });
    expect(screen.getByRole('region', { name: 'Projects' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Project details' }).textContent).toContain(
      'Choose a project'
    );
    expect(view.container.querySelector('[data-has-detail="false"]')).toBeTruthy();
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
