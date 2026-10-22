import type { FormBlock as FormBlockData } from '@protoyard/blocks';
import type { DocDocument, PageDocument } from '@protoyard/pages';
import { cleanup, render, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DocHost from '../src/doc/DocHost.svelte';
import FormBlock from '../src/form/FormBlock.svelte';
import PageHost from '../src/page/PageHost.svelte';

vi.mock('../src/block-host/index.ts', async () => {
  // Real heading elements so landmarks, TOC and focus targets exist without blocks-ui.
  const Mock = (await import('./fixtures/MockDocBlockHost.svelte')).default;
  return { BlockHost: Mock };
});

vi.mock('@protoyard/blocks-ui', () => ({
  setBlockHost: vi.fn(),
}));

afterEach(cleanup);

function pageFixture(): PageDocument {
  return {
    id: 'a11y-landing',
    title: 'Accessible landing',
    description: 'Fictional landing for a11y unit coverage.',
    sections: [
      {
        id: 'hero',
        role: 'hero',
        title: 'Hero',
        blocks: [
          { type: 'heading', id: 'welcome', level: 1, text: 'Welcome to Harbor' },
          { type: 'text', markdown: 'Hero body.' },
        ],
      },
      {
        id: 'features',
        anchor: 'features',
        role: 'features',
        title: 'Features',
        blocks: [
          { type: 'heading', id: 'features-heading', level: 2, text: 'Features' },
          { type: 'text', markdown: 'Feature details.' },
        ],
      },
      {
        id: 'footer',
        role: 'footer',
        title: 'Footer',
        blocks: [{ type: 'text', markdown: 'Footer at example.com' }],
      },
    ],
    nav: [
      { id: 'nav-top', label: 'Top', href: '#hero' },
      { id: 'nav-features', label: 'Features', href: '#features' },
    ],
  };
}

function docFixture(): DocDocument {
  // Chrome already paints the document title as h1; body starts at h2 so TOC
  // and focus targets stay unique under DocsLayout.
  return {
    id: 'a11y-doc',
    title: 'Accessible handbook',
    description: 'Fictional handbook for a11y unit coverage.',
    toc: { depth: 3, sticky: true },
    blocks: [
      { type: 'text', markdown: 'Intro copy.' },
      { type: 'heading', id: 'getting-started', level: 2, text: 'Getting started' },
      { type: 'heading', id: 'first-steps', level: 3, text: 'First steps' },
      { type: 'text', markdown: 'Do the first thing.' },
      { type: 'heading', id: 'next-section', level: 2, text: 'Next section' },
      { type: 'text', markdown: 'More body.' },
    ],
  };
}

const contactForm = {
  type: 'form',
  id: 'contact',
  title: 'Contact',
  fields: [
    {
      name: 'email',
      label: 'Work email',
      type: 'email',
      required: true,
      placeholder: 'you@example.com',
    },
    {
      name: 'notes',
      label: 'Notes',
      type: 'longText',
      help: 'Optional fictional notes.',
    },
  ],
  submitLabel: 'Send message',
  successMessage: 'Thanks — simulated only.',
} satisfies FormBlockData;

describe('page and doc accessibility', () => {
  it('exposes a main landmark and main navigation on PageHost', async () => {
    const view = render(PageHost, { props: { page: pageFixture() } });
    await waitFor(() => {
      expect(view.container.querySelector('[data-py-page-host]')).toBeTruthy();
    });

    const main = view.getByRole('main');
    expect(main).toBeTruthy();
    expect(main.querySelector('[data-py-page-section="hero"]')).toBeTruthy();

    const nav = view.getByRole('navigation', { name: 'Main navigation' });
    expect(nav).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Features' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Top' })).toBeTruthy();
  });

  it('exposes named main and TOC navigation on DocHost', async () => {
    const view = render(DocHost, { props: { doc: docFixture() } });
    await waitFor(() => {
      expect(view.container.querySelector('[data-py-doc-host]')).toBeTruthy();
    });

    const main = view.getByRole('main', { name: 'Document content' });
    expect(main).toBeTruthy();
    expect(
      within(main).getByRole('heading', { level: 1, name: 'Accessible handbook' })
    ).toBeTruthy();

    const toc = view.getByLabelText('On this page');
    expect(toc.tagName.toLowerCase()).toBe('aside');
    await waitFor(() => {
      expect(within(toc).getByRole('link', { name: 'Getting started' })).toBeTruthy();
    });
    expect(within(toc).getByRole('link', { name: 'Next section' })).toBeTruthy();
    expect(within(toc).getByRole('link', { name: 'First steps' })).toBeTruthy();

    const sectionsNav = view.getByRole('navigation', { name: 'Document sections' });
    expect(within(sectionsNav).getByRole('link', { name: 'Getting started' })).toBeTruthy();
    expect(within(sectionsNav).getByRole('link', { name: 'Next section' })).toBeTruthy();
  });

  it('associates form field labels with controls', () => {
    const services = {
      submit: vi.fn(async () => ({
        id: 'response-1',
        formId: 'contact',
        createdAt: '2026-01-01T00:00:00.000Z',
        values: {},
      })),
    };
    const view = render(FormBlock, {
      props: { form: contactForm, services },
    });

    const email = view.getByLabelText(/Work email/);
    expect(email.tagName.toLowerCase()).toBe('input');
    expect((email as HTMLInputElement).type).toBe('email');

    const notes = view.getByLabelText(/Notes/);
    expect(notes.tagName.toLowerCase()).toBe('textarea');

    expect(view.getByRole('button', { name: 'Send message' })).toBeTruthy();
  });

  it('can move focus to the first heading on page and doc hosts', async () => {
    const pageView = render(PageHost, { props: { page: pageFixture() } });
    await waitFor(() => {
      expect(pageView.container.querySelector('h1')).toBeTruthy();
    });
    const pageHeading = pageView.getByRole('heading', { level: 1, name: 'Welcome to Harbor' });
    pageHeading.focus();
    expect(document.activeElement).toBe(pageHeading);
    pageView.unmount();

    const docView = render(DocHost, { props: { doc: docFixture() } });
    await waitFor(() => {
      expect(docView.container.querySelector('[data-py-doc-header] h1')).toBeTruthy();
    });
    const header = docView.container.querySelector('[data-py-doc-header]') as HTMLElement;
    const docTitle = within(header).getByRole('heading', {
      level: 1,
      name: 'Accessible handbook',
    });
    docTitle.focus();
    expect(document.activeElement).toBe(docTitle);
  });
});
