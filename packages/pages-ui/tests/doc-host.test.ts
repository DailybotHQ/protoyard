import type { DocDocument } from '@protoyard/pages';
import { buildDocToc } from '@protoyard/pages';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DocHost from '../src/doc/DocHost.svelte';

vi.mock('../src/block-host/index.ts', async () => {
  const Mock = (await import('./fixtures/MockDocBlockHost.svelte')).default;
  return { BlockHost: Mock };
});

vi.mock('@protoyard/blocks-ui', () => ({
  setBlockHost: vi.fn(),
  getBlockHost: () => ({ density: 'comfortable', canvasMode: 'flow' }),
}));

afterEach(() => cleanup());

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
        eyebrow: 'A practical guide',
        subtitle: 'Everything needed for the first day.',
      },
      { type: 'text', markdown: 'Intro copy for the handbook.' },
      { type: 'heading', id: 'getting-started', level: 2, text: 'Getting started' },
      { type: 'heading', id: 'first-steps', level: 3, text: 'First steps' },
      { type: 'text', markdown: 'Do the first thing.' },
      { type: 'heading', id: 'next-section', level: 2, text: 'Next section' },
      { type: 'text', markdown: 'More body copy.' },
    ],
  };
}

describe('DocHost', () => {
  it('renders one title and one TOC with ids from buildDocToc', async () => {
    const doc = fixtureDoc();
    const view = render(DocHost, { props: { doc } });
    const expected = buildDocToc(doc);

    expect(view.container.querySelector('[data-py-doc-host]')?.getAttribute('data-doc-id')).toBe(
      'fixture-doc'
    );
    expect(view.container.querySelectorAll('[data-py-doc-host] h1')).toHaveLength(1);
    expect(view.container.querySelector('[data-py-doc-title]')?.textContent?.trim()).toBe(
      'Fixture handbook'
    );
    expect(view.container.querySelector('[data-py-doc-eyebrow]')?.textContent?.trim()).toBe(
      'A practical guide'
    );
    expect(view.container.querySelector('[data-py-doc-subtitle]')?.textContent?.trim()).toBe(
      'Everything needed for the first day.'
    );
    expect(view.container.querySelectorAll('[data-py-doc-toc]')).toHaveLength(1);
    expect(view.container.querySelector('[data-py-doc-nav]')).toBeNull();

    await waitFor(() => {
      for (const item of expected) {
        expect(view.container.querySelector(`#${item.id}`)).toBeTruthy();
        expect(view.container.querySelector(`[data-py-doc-toc-link="${item.id}"]`)).toBeTruthy();
      }
    });
    expect(view.container.querySelectorAll('[data-py-doc-block="heading"]')).toHaveLength(3);
  });

  it('can hide the outline without changing the document body', async () => {
    const doc = fixtureDoc();
    const view = render(DocHost, { props: { doc, showNav: false } });
    await waitFor(() => expect(view.container.querySelector('[data-py-doc-flow]')).toBeTruthy());
    expect(view.container.querySelector('[data-py-doc-toc]')).toBeNull();
    expect(view.container.querySelector('[data-py-doc-title]')?.textContent?.trim()).toBe(
      'Fixture handbook'
    );
  });
});
