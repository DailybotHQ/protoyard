import type { FormBlock } from '@protoyard/blocks';
import type { DocDocument, FormServices } from '@protoyard/pages';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DocApp from '../src/doc/DocApp.svelte';
import DocHost from '../src/doc/DocHost.svelte';

vi.mock('../src/block-host/index.ts', async () => {
  const Mock = (await import('./fixtures/MockDocBlockHost.svelte')).default;
  return { BlockHost: Mock };
});

vi.mock('@protoyard/blocks-ui', () => ({
  setBlockHost: vi.fn(),
  getBlockHost: () => ({ density: 'comfortable', canvasMode: 'flow' }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function report(): DocDocument {
  return {
    id: 'annual-report',
    title: 'Northwind Labs Annual Report',
    description: 'Fictional company results for 2026.',
    style: 'soft-violet',
    toc: { depth: 3, sticky: true },
    blocks: [
      {
        type: 'heading',
        id: 'report-title',
        level: 1,
        text: 'Northwind Labs Annual Report',
        eyebrow: 'Fictional results · 2026',
        subtitle: 'A year of steady, sustainable growth.',
      },
      { type: 'callout', body: 'Every figure in this report is fictional.' },
      { type: 'heading', id: 'highlights', level: 2, text: 'Highlights' },
      { type: 'text', markdown: 'A readable report body.' },
      { type: 'heading', id: 'outlook', level: 2, text: 'Outlook' },
    ],
  } as DocDocument;
}

function contactForm(): FormBlock {
  return {
    type: 'form',
    id: 'contact-form',
    title: 'Contact us',
    fields: [{ name: 'email', label: 'Email', type: 'email', required: true }],
    submitLabel: 'Send message',
    successMessage: 'Thanks. We received your message.',
  };
}

describe('document reading design', () => {
  it('uses one title block and one responsive table of contents', async () => {
    const doc = report();
    const view = render(DocHost, { props: { doc } });

    await waitFor(() => expect(view.container.querySelector('#highlights')).toBeTruthy());

    expect(view.container.querySelectorAll('[data-py-doc-toc]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-py-doc-nav]')).toHaveLength(0);
    expect(view.container.querySelectorAll('[data-py-doc-host] h1')).toHaveLength(1);
    expect(view.container.querySelector('[data-py-doc-title]')?.textContent?.trim()).toBe(
      doc.title
    );
    expect(view.container.querySelector('[data-py-doc-eyebrow]')?.textContent?.trim()).toBe(
      'Fictional results · 2026'
    );
    expect(view.container.querySelector('[data-py-doc-subtitle]')?.textContent?.trim()).toBe(
      'A year of steady, sustainable growth.'
    );
    expect(view.container.querySelectorAll('[data-py-doc-block="heading"]')).toHaveLength(2);
    expect(view.container.querySelector('[data-py-doc-toc]')?.tagName).toBe('DETAILS');

    const toc = within(view.container.querySelector('[data-py-doc-toc]') as HTMLElement);
    expect(toc.getByRole('link', { name: 'Highlights' })).toBeTruthy();
    expect(toc.getByRole('link', { name: 'Outlook' })).toBeTruthy();
    expect(view.container.querySelector('.doc-reading__article')).toBeTruthy();
    expect(view.container.querySelector('[data-py-doc-flow]')?.getAttribute('class')).toMatch(
      /doc-reading__flow/
    );
  });

  it('tracks the heading intersecting the reading viewport', async () => {
    const view = render(DocHost, { props: { doc: report() } });
    await waitFor(() => expect(view.container.querySelector('#outlook')).toBeTruthy());
    const outlook = document.getElementById('outlook');
    expect(outlook).toBeTruthy();
    if (outlook) {
      vi.spyOn(outlook, 'getBoundingClientRect').mockReturnValue({
        top: 20,
        height: 24,
      } as DOMRect);
      window.dispatchEvent(new Event('scroll'));
    }

    await waitFor(() => {
      expect(
        within(view.container.querySelector('[data-py-doc-toc]') as HTMLElement)
          .getByRole('link', { name: 'Outlook' })
          .getAttribute('aria-current')
      ).toBe('location');
    });
  });

  it('provides form services before doc blocks initialize and submits a response', async () => {
    const submit = vi.fn().mockResolvedValue({ id: 'response-1' });
    const formServices: FormServices = {
      submit,
      list: vi.fn().mockResolvedValue([]),
      exportCsv: vi.fn().mockResolvedValue(''),
      clear: vi.fn().mockResolvedValue(0),
    };
    const doc = { ...report(), blocks: [...report().blocks, contactForm()] };
    const view = render(DocApp, { props: { doc, formServices } });

    expect(view.container.querySelector('[data-py-form-disabled]')).toBeNull();
    await fireEvent.input(view.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'ada@example.com' },
    });
    await fireEvent.click(view.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith('contact-form', { email: 'ada@example.com' })
    );
    expect((await view.findByRole('status')).textContent).toContain(
      'Thanks. We received your message.'
    );
  });
});
