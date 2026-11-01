import type { PrototypeRuntime } from '@protoyard/core';
import type { DocDocument } from '@protoyard/pages';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DocApp from '../src/doc/DocApp.svelte';

const exportDoc = vi.fn();

vi.mock('../src/doc/doc-export.ts', () => ({ exportDoc }));
vi.mock('../src/doc/DocEditor.svelte', async () => ({
  default: (await import('./fixtures/MockDocEditor.svelte')).default,
}));
vi.mock('../src/block-host/index.ts', async () => {
  const Mock = (await import('./fixtures/MockDocBlockHost.svelte')).default;
  return { BlockHost: Mock };
});
vi.mock('@protoyard/blocks-ui', () => ({
  setBlockHost: vi.fn(),
  getBlockHost: () => ({ density: 'comfortable', canvasMode: 'flow' }),
}));

const doc: DocDocument = {
  id: 'tools-doc',
  title: 'Tools doc',
  blocks: [
    { type: 'heading', id: 'title', level: 1, text: 'Tools doc' },
    { type: 'text', id: 'intro', markdown: 'Original body.' },
  ],
};

function runtimeThatCan(capabilities: readonly string[]): PrototypeRuntime {
  return {
    // `subscribe` is part of the session contract: DocApp re-checks on a persona switch.
    session: {
      can: (capability: string) => capabilities.includes(capability),
      subscribe: () => () => {},
    },
    manifest: { storage: { namespace: 'tools-doc' } },
  } as unknown as PrototypeRuntime;
}

beforeEach(() => {
  exportDoc.mockReset();
});
afterEach(cleanup);

describe('DocApp tools', () => {
  it('downloads each format through exportDoc and reports the file', async () => {
    exportDoc.mockResolvedValue({
      format: 'pdf',
      filename: 'tools-doc.pdf',
      size: 2_048,
      pageCount: 2,
      notes: ['Images are written as their descriptions.'],
    });
    const view = render(DocApp, { props: { doc } });
    for (const name of ['Download as Word', 'Download as PDF', 'Download as Markdown']) {
      expect(view.getByRole('button', { name })).toBeTruthy();
    }
    await fireEvent.click(view.getByRole('button', { name: 'Download as PDF' }));
    await waitFor(() => expect(exportDoc).toHaveBeenCalledWith(doc, 'pdf'));
    const status = view.container.querySelector('[data-py-doc-export-status]');
    await waitFor(() =>
      expect(status?.textContent).toContain('Saved tools-doc.pdf (2.0 KB, 2 pages).')
    );
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.textContent).toContain('Images are written as their descriptions.');
  });

  it('shows an error notice when a writer fails', async () => {
    exportDoc.mockRejectedValue(new Error('Writer failed (simulated)'));
    const view = render(DocApp, { props: { doc } });
    await fireEvent.click(view.getByRole('button', { name: 'Download as Word' }));
    await waitFor(() => expect(view.getByText('The download failed')).toBeTruthy());
    expect(view.getByText('Writer failed (simulated)')).toBeTruthy();
  });

  it('hides Edit from personas without the edit capability, keeps downloads', () => {
    const viewer = render(DocApp, { props: { doc, runtime: runtimeThatCan([]) } });
    expect(viewer.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(viewer.getByRole('button', { name: 'Download as Word' })).toBeTruthy();
    viewer.unmount();

    const presenter = render(DocApp, {
      props: { doc, runtime: runtimeThatCan(['blocks:interact']) },
    });
    expect(presenter.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('applies edits to the reading view, names what was left out, and resets', async () => {
    const view = render(DocApp, { props: { doc } });
    await fireEvent.click(view.getByRole('button', { name: 'Edit' }));
    await waitFor(() =>
      expect(view.container.querySelector('[data-py-mock-doc-editor]')).toBeTruthy()
    );
    expect(view.container.querySelector('[data-py-doc-host]')).toBeNull();

    await fireEvent.click(view.getByRole('button', { name: 'Mock apply' }));
    await waitFor(() => expect(view.container.querySelector('[data-py-doc-host]')).toBeTruthy());
    expect(view.container.querySelector('[data-py-doc-edited]')?.textContent).toContain(
      'Edits stay in this tab'
    );
    expect(await view.findByText('Some edits have no doc equivalent')).toBeTruthy();

    // Downloads write the edited doc.
    exportDoc.mockResolvedValue({ format: 'markdown', filename: 'a.md', size: 10, notes: [] });
    await fireEvent.click(view.getByRole('button', { name: 'Download as Markdown' }));
    await waitFor(() => expect(exportDoc).toHaveBeenCalled());
    const written = exportDoc.mock.calls[0]?.[0] as DocDocument;
    expect(written.blocks[1]).toMatchObject({ markdown: 'Edited in the editor.' });

    await fireEvent.click(view.getByRole('button', { name: 'Reset to the original' }));
    await waitFor(() => expect(view.container.querySelector('[data-py-doc-edited]')).toBeNull());
    expect(view.queryByText('Some edits have no doc equivalent')).toBeNull();
  });

  it('discards an edit session without changes', async () => {
    const view = render(DocApp, { props: { doc } });
    await fireEvent.click(view.getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(view.getByRole('button', { name: 'Mock cancel' })).toBeTruthy());
    await fireEvent.click(view.getByRole('button', { name: 'Mock cancel' }));
    await waitFor(() => expect(view.container.querySelector('[data-py-doc-host]')).toBeTruthy());
    expect(view.container.querySelector('[data-py-doc-edited]')).toBeNull();
  });

  it('can turn the tool bar off', () => {
    const view = render(DocApp, { props: { doc, tools: false } });
    expect(view.container.querySelector('[data-py-doc-tools]')).toBeNull();
  });
});
