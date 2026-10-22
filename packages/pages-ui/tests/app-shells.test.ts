import type { DocDocument, PageDocument } from '@protoyard/pages';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DocApp from '../src/doc/DocApp.svelte';
import PageApp from '../src/page/PageApp.svelte';

vi.mock('../src/block-host/index.ts', async () => {
  const Mock = (await import('./fixtures/MockBlockHost.svelte')).default;
  return { BlockHost: Mock };
});

vi.mock('@protoyard/blocks-ui', () => ({
  setBlockHost: vi.fn(),
}));

afterEach(cleanup);

const pageFixture: PageDocument = {
  id: 'shell-landing',
  title: 'Shell Landing',
  description: 'PageApp shell fixture.',
  sections: [
    {
      id: 'hero',
      role: 'hero',
      title: 'Hero',
      blocks: [{ type: 'heading', text: 'Hello', level: 1 }],
    },
    {
      id: 'body',
      role: 'body',
      title: 'Body',
      blocks: [{ type: 'text', markdown: 'Body copy.' }],
    },
    {
      id: 'footer',
      role: 'footer',
      title: 'Footer',
      blocks: [{ type: 'text', markdown: 'Footer at example.com' }],
    },
  ],
};

const docFixture: DocDocument = {
  id: 'shell-doc',
  title: 'Shell Doc',
  description: 'DocApp shell fixture.',
  blocks: [
    { type: 'heading', text: 'Report', level: 1 },
    { type: 'text', markdown: 'Narrative for example.com.' },
  ],
  toc: { depth: 2, sticky: true },
};

describe('PageApp and DocApp', () => {
  it('mounts PageApp and exposes data-py-page-host', async () => {
    const view = render(PageApp, { props: { page: pageFixture } });
    expect(view.container.querySelector('[data-py-page-app]')).toBeTruthy();
    await waitFor(() => {
      expect(view.container.querySelector('[data-py-page-host]')).toBeTruthy();
    });
    expect(view.container.querySelector('[data-page-id="shell-landing"]')).toBeTruthy();
    expect(view.getByText('Shell Landing')).toBeTruthy();
  });

  it('mounts DocApp and exposes data-py-doc-host', async () => {
    const view = render(DocApp, { props: { doc: docFixture } });
    expect(view.container.querySelector('[data-py-doc-app]')).toBeTruthy();
    await waitFor(() => {
      expect(view.container.querySelector('[data-py-doc-host]')).toBeTruthy();
    });
    expect(view.container.querySelector('[data-doc-id="shell-doc"]')).toBeTruthy();
  });

  it('shows loading and error states with retry parity', async () => {
    const onRetry = vi.fn();
    const loading = render(PageApp, {
      props: { page: pageFixture, loading: true },
    });
    expect(loading.getByText(/Loading the page/i)).toBeTruthy();
    loading.unmount();

    const errored = render(PageApp, {
      props: {
        page: pageFixture,
        error: new Error('Network offline (simulated)'),
        onRetry,
      },
    });
    expect(errored.getByText(/could not be loaded/i)).toBeTruthy();
    await errored.getByRole('button', { name: 'Try again' }).click();
    expect(onRetry).toHaveBeenCalled();
  });
});
