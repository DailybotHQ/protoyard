import type { DocDocument } from '@protoyard/pages';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DocEditor from '../src/doc/DocEditor.svelte';

afterEach(cleanup);

const doc: DocDocument = {
  id: 'editor-doc',
  title: 'Editor doc',
  blocks: [
    { type: 'heading', id: 'title', level: 1, text: 'Editor doc' },
    { type: 'text', id: 'intro', markdown: 'Body text.' },
    {
      type: 'table',
      id: 'numbers',
      caption: 'Numbers by region',
      columns: [{ label: 'Region' }],
      rows: [['North']],
    },
    { type: 'text', id: 'outro', markdown: 'Closing text.' },
  ],
};

describe('DocEditor (real @texuli/pages editor)', () => {
  it('paints the doc in the Texuli editor with Protoyard blocks painted by the host (G111)', async () => {
    const view = render(DocEditor, { props: { doc, onApply: vi.fn(), onCancel: vi.fn() } });
    const root = view.container.querySelector('[data-py-doc-editor]');
    expect(root?.getAttribute('aria-label')).toBe('Edit Editor doc');
    await waitFor(() => expect(root?.textContent).toContain('Body text.'));
    expect(root?.textContent).toContain('Closing text.');
    // Texuli hands the protoyard-block embed to the host's renderBlock, which
    // paints the real block read-only, not a refused placeholder.
    const host = await waitFor(() => {
      const found = root?.querySelector('[data-py-doc-editor-host-block]');
      if (!found) throw new Error('host block not painted yet');
      return found;
    });
    expect(host.hasAttribute('inert')).toBe(true);
    await waitFor(() => expect(host.textContent).toContain('Numbers by region'));
    expect(root?.textContent).not.toContain('Shown in the reading view');
    const apply = view.getByRole('button', { name: 'Apply changes' });
    expect(apply.hasAttribute('disabled') || apply.getAttribute('aria-disabled') === 'true').toBe(
      true
    );
  });

  it('applies a reorder from the op log back to the doc body', async () => {
    const onApply = vi.fn();
    const view = render(DocEditor, { props: { doc, onApply, onCancel: vi.fn() } });
    const handles = await waitFor(() => {
      const found = view.container.querySelectorAll<HTMLElement>(
        '[data-py-doc-editor] [aria-roledescription], [data-py-doc-editor] .tx-pages-handle'
      );
      expect(found.length).toBeGreaterThan(2);
      return found;
    });
    // Alt+ArrowDown moves the focused block one row down (the editor's keyboard reorder).
    const outroIndex = 3;
    const handle = handles[outroIndex - 2] as HTMLElement;
    handle.focus();
    await fireEvent.keyDown(handle, { key: 'ArrowDown', altKey: true });
    await waitFor(() =>
      expect(
        (view.getByRole('button', { name: 'Apply changes' }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
    await fireEvent.click(view.getByRole('button', { name: 'Apply changes' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const [next, notes] = onApply.mock.calls[0] as [DocDocument, unknown[]];
    expect(notes).toEqual([]);
    expect(next.blocks.map((block) => block.id)).not.toEqual(doc.blocks.map((block) => block.id));
    expect(new Set(next.blocks.map((block) => block.id))).toEqual(
      new Set(doc.blocks.map((block) => block.id))
    );
  });

  it('names a refused save and stays open', async () => {
    const onApply = vi.fn().mockRejectedValue(
      Object.assign(new Error('Validation failed'), {
        issues: { document: 'These edits belong to another doc.' },
      })
    );
    const view = render(DocEditor, { props: { doc, onApply, onCancel: vi.fn() } });
    const handles = await waitFor(() => {
      const found = view.container.querySelectorAll<HTMLElement>(
        '[data-py-doc-editor] [aria-roledescription], [data-py-doc-editor] .tx-pages-handle'
      );
      expect(found.length).toBeGreaterThan(2);
      return found;
    });
    const handle = handles[1] as HTMLElement;
    handle.focus();
    await fireEvent.keyDown(handle, { key: 'ArrowDown', altKey: true });
    await waitFor(() =>
      expect(
        (view.getByRole('button', { name: 'Apply changes' }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
    await fireEvent.click(view.getByRole('button', { name: 'Apply changes' }));
    expect(await view.findByText('These edits belong to another doc.')).toBeTruthy();
    expect(view.container.querySelector('[data-py-doc-editor]')).toBeTruthy();
  });

  it('discards through onCancel', async () => {
    const onCancel = vi.fn();
    const view = render(DocEditor, { props: { doc, onApply: vi.fn(), onCancel } });
    await fireEvent.click(view.getByRole('button', { name: 'Discard' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
