import { definePrototypeFromDoc, KIND_PERSONAS } from '@protoyard/blueprint/kinds';
import type { PrototypeRuntime } from '@protoyard/core';
import type { DocDocument } from '@protoyard/pages';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import DocApp from '../src/doc/DocApp.svelte';

/**
 * Applied doc edits are saved per doc and world (PLAN_008 decision D3): they
 * survive remounting DocApp on a reloaded runtime of the same world, and
 * Reset removes them. The editor and block renderers are test doubles; the
 * runtime, the docEdits store and the service are real.
 */

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
  id: 'saved-doc',
  title: 'Saved doc',
  blocks: [
    { type: 'heading', id: 'title', level: 1, text: 'Saved doc' },
    { type: 'text', id: 'intro', markdown: 'Original body.' },
  ],
};

let harness = createHarness(definePrototypeFromDoc(doc, { namespace: 'pages-ui-saved-0' }));
let sequence = 0;
beforeEach(() => {
  sequence += 1;
  exportDoc.mockReset();
  exportDoc.mockResolvedValue({ format: 'markdown', filename: 'a.md', size: 10, notes: [] });
  harness = createHarness(definePrototypeFromDoc(doc, { namespace: `pages-ui-saved-${sequence}` }));
});
afterEach(() => {
  cleanup();
  harness.closeAll();
});

const storedRows = (runtime: PrototypeRuntime) =>
  (runtime.db as { table(name: string): { toArray(): Promise<unknown[]> } })
    .table('docEdits')
    .toArray();

/** What the helpers use of a rendered DocApp. */
type View = Pick<
  ReturnType<typeof render<typeof DocApp>>,
  'container' | 'getByRole' | 'findByRole'
>;

/** The doc the reading view shows, read through what Download would write. */
async function shownBody(view: View): Promise<string | undefined> {
  exportDoc.mockClear();
  await fireEvent.click(view.getByRole('button', { name: 'Download as Markdown' }));
  await waitFor(() => expect(exportDoc).toHaveBeenCalled());
  const written = exportDoc.mock.calls[0]?.[0] as DocDocument;
  const intro = written.blocks.find((block) => block.id === 'intro');
  return intro?.type === 'text' ? intro.markdown : undefined;
}

async function applyEdit(view: View): Promise<void> {
  await fireEvent.click(await view.findByRole('button', { name: 'Edit' }));
  await fireEvent.click(await view.findByRole('button', { name: 'Mock apply' }));
  await waitFor(() => expect(view.container.querySelector('[data-py-doc-host]')).toBeTruthy());
}

describe('DocApp saved edits', () => {
  it('keeps an applied edit after remounting on the same world, and Reset clears it', async () => {
    let runtime = await harness.boot();
    let view = render(DocApp, { props: { doc, runtime } });
    await applyEdit(view);
    await waitFor(async () => expect(await storedRows(runtime)).toHaveLength(1));
    expect(view.container.querySelector('[data-py-doc-edited]')?.textContent).toContain(
      'Edits are saved in this browser for this world.'
    );
    expect(await shownBody(view)).toBe('Edited in the editor.');

    // A page reload: a new runtime on the same storage, a fresh DocApp.
    view.unmount();
    runtime = await harness.reload(runtime);
    view = render(DocApp, { props: { doc, runtime } });
    await waitFor(() => expect(view.container.querySelector('[data-py-doc-edited]')).toBeTruthy());
    expect(await shownBody(view)).toBe('Edited in the editor.');

    await fireEvent.click(view.getByRole('button', { name: 'Reset to the original' }));
    await waitFor(() => expect(view.container.querySelector('[data-py-doc-edited]')).toBeNull());
    expect(await storedRows(runtime)).toEqual([]);
    expect(await shownBody(view)).toBe('Original body.');

    view.unmount();
    runtime = await harness.reload(runtime);
    view = render(DocApp, { props: { doc, runtime } });
    await waitFor(() => expect(view.container.querySelector('[data-py-doc-host]')).toBeTruthy());
    expect(view.container.querySelector('[data-py-doc-edited]')).toBeNull();
    expect(await shownBody(view)).toBe('Original body.');
  });

  it('shows saved edits to a viewer, without Edit or Reset', async () => {
    const runtime = await harness.boot();
    const presenter = render(DocApp, { props: { doc, runtime } });
    await applyEdit(presenter);
    await waitFor(async () => expect(await storedRows(runtime)).toHaveLength(1));
    presenter.unmount();

    await runtime.session.switchActor(KIND_PERSONAS.viewer);
    const viewer = render(DocApp, { props: { doc, runtime } });
    await waitFor(() =>
      expect(viewer.container.querySelector('[data-py-doc-edited]')).toBeTruthy()
    );
    expect(viewer.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(viewer.queryByRole('button', { name: 'Reset to the original' })).toBeNull();
    expect(await shownBody(viewer)).toBe('Edited in the editor.');
  });

  it('takes Edit and Reset away as soon as the persona switches to a viewer', async () => {
    const runtime = await harness.boot();
    const view = render(DocApp, { props: { doc, runtime } });
    await applyEdit(view);
    await view.findByRole('button', { name: 'Reset to the original' });

    // Same mounted app: the permission check follows the principal.
    await runtime.session.switchActor(KIND_PERSONAS.viewer);
    await waitFor(() => expect(view.queryByRole('button', { name: 'Edit' })).toBeNull());
    expect(view.queryByRole('button', { name: 'Reset to the original' })).toBeNull();
  });

  it('does not show edits saved on an earlier version of the doc', async () => {
    let runtime = await harness.boot();
    const view = render(DocApp, { props: { doc, runtime } });
    await applyEdit(view);
    await waitFor(async () => expect(await storedRows(runtime)).toHaveLength(1));
    view.unmount();

    runtime = await harness.reload(runtime);
    const changed: DocDocument = { ...doc, title: 'Saved doc, revised' };
    const next = render(DocApp, { props: { doc: changed, runtime } });
    expect(await next.findByText('Saved edits are for an earlier version')).toBeTruthy();
    expect(next.container.querySelector('[data-py-doc-edited]')).toBeNull();
    await fireEvent.click(next.getByRole('button', { name: 'Reset to the original' }));
    await waitFor(async () => expect(await storedRows(runtime)).toEqual([]));
    await waitFor(() =>
      expect(next.queryByText('Saved edits are for an earlier version')).toBeNull()
    );
  });
});
