import type { DocDocument } from '@protoyard/pages';
import { buildDocToc } from '@protoyard/pages';
import { cleanup, render, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DocHost from '../src/doc/DocHost.svelte';

vi.mock('../src/block-host/index.ts', async () => {
  const Mock = (await import('./fixtures/MockDocBlockHost.svelte')).default;
  return { BlockHost: Mock };
});

vi.mock('@protoyard/blocks-ui', () => ({
  setBlockHost: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fixtureDoc(): DocDocument {
  return {
    id: 'fixture-doc',
    title: 'Fixture handbook',
    description: 'Fictional doc for DocHost unit tests.',
    style: 'soft-violet',
    toc: { depth: 3, sticky: true },
    blocks: [
      {
        type: 'heading',
        id: 'title',
        level: 1,
        text: 'Fixture handbook',
      },
      {
        type: 'text',
        markdown: 'Intro copy for the handbook.',
      },
      {
        type: 'heading',
        id: 'getting-started',
        level: 2,
        text: 'Getting started',
      },
      {
        type: 'heading',
        id: 'first-steps',
        level: 3,
        text: 'First steps',
      },
      {
        type: 'text',
        markdown: 'Do the first thing.',
      },
      {
        type: 'heading',
        id: 'next-section',
        level: 2,
        text: 'Next section',
      },
      {
        type: 'text',
        markdown: 'More body copy.',
      },
    ],
  };
}

function tocAside(container: HTMLElement): HTMLElement {
  const aside = container.querySelector('[data-py-docs-layout] aside');
  if (!aside) throw new Error('DocsLayout TOC aside missing');
  return aside as HTMLElement;
}

describe('DocHost', () => {
  it('renders continuous flow inside DocsLayout with data-py-doc-host', async () => {
    const doc = fixtureDoc();
    const view = render(DocHost, { props: { doc } });

    const host = view.container.querySelector('[data-py-doc-host]');
    expect(host).toBeTruthy();
    expect(host?.getAttribute('data-doc-id')).toBe('fixture-doc');
    expect(host?.getAttribute('data-style')).toBe('soft-violet');
    expect(host?.getAttribute('data-toc-sticky')).toBe('true');
    expect(view.container.querySelector('[data-py-docs-layout]')).toBeTruthy();
    expect(view.container.querySelector('[data-py-doc-flow]')).toBeTruthy();
    expect(view.container.querySelector('[data-py-doc-header]')).toBeTruthy();
    expect(view.container.querySelector('[data-py-doc-brand]')?.textContent?.trim()).toBe(
      'Fixture handbook'
    );

    await waitFor(() => {
      expect(view.container.querySelectorAll('[data-py-mock-block-host]').length).toBe(
        doc.blocks.length
      );
    });
  });

  it('exposes heading ids that match buildDocToc and TOC links for h2/h3', async () => {
    const doc = fixtureDoc();
    const expected = buildDocToc(doc);
    expect(expected.map((item) => item.id)).toEqual([
      'getting-started',
      'first-steps',
      'next-section',
    ]);

    const view = render(DocHost, { props: { doc } });

    await waitFor(() => {
      expect(view.container.querySelector('#getting-started')).toBeTruthy();
      expect(view.container.querySelector('#first-steps')).toBeTruthy();
      expect(view.container.querySelector('#next-section')).toBeTruthy();
    });

    const toc = within(tocAside(view.container));
    await waitFor(() => {
      expect(toc.getByRole('link', { name: 'Getting started' })).toBeTruthy();
      expect(toc.getByRole('link', { name: 'First steps' })).toBeTruthy();
      expect(toc.getByRole('link', { name: 'Next section' })).toBeTruthy();
    });

    const tocLink = toc.getByRole('link', { name: 'Getting started' });
    expect(tocLink.getAttribute('href')).toBe('#getting-started');

    // Left nav also lists level-2 entries.
    expect(view.container.querySelector('[data-py-doc-nav-link="getting-started"]')).toBeTruthy();
    expect(view.container.querySelector('[data-py-doc-nav-link="next-section"]')).toBeTruthy();
  });

  it('updates aria-current under a test IntersectionObserver', async () => {
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

    const doc = fixtureDoc();
    const view = render(DocHost, { props: { doc } });
    const toc = within(tocAside(view.container));

    await waitFor(() => expect(toc.getByRole('link', { name: 'Next section' })).toBeTruthy());

    const nextHeading = document.getElementById('next-section');
    expect(nextHeading).toBeTruthy();
    if (nextHeading) observer?.trigger(nextHeading);

    await waitFor(() =>
      expect(toc.getByRole('link', { name: 'Next section' }).getAttribute('aria-current')).toBe(
        'location'
      )
    );
  });

  it('can hide the optional left nav', async () => {
    const doc = fixtureDoc();
    const view = render(DocHost, { props: { doc, showNav: false } });
    await waitFor(() => expect(view.container.querySelector('[data-py-doc-flow]')).toBeTruthy());
    expect(view.container.querySelector('[data-py-doc-nav]')).toBeNull();
  });
});
