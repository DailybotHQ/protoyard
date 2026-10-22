import { definePrototypeFromDoc } from '@protoyard/blueprint/kinds';
import type { PrototypeRuntime } from '@protoyard/core';
import type { DocDocument } from '@protoyard/pages';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import DocApp from '../src/doc/DocApp.svelte';

let harnesses: ReturnType<typeof createHarness>[] = [];
afterEach(() => {
  cleanup();
  for (const h of harnesses) h.closeAll();
  harnesses = [];
});

const responses = (runtime: PrototypeRuntime) =>
  (runtime.db as { table(name: string): { toArray(): Promise<Record<string, unknown>[]> } })
    .table('formResponses')
    .toArray();

const docWithForm: DocDocument = {
  id: 'unit-doc-form',
  title: 'Unit doc with feedback',
  description: 'Level-1 style DocApp form path.',
  toc: { depth: 2 },
  blocks: [
    { type: 'heading', id: 'title', level: 1, text: 'Unit doc with feedback' },
    { type: 'text', markdown: 'Intro for the form below.' },
    {
      type: 'form',
      id: 'unit-feedback',
      title: 'Feedback',
      fields: [{ name: 'email', label: 'Email', type: 'email', required: true }],
      submitLabel: 'Send',
      successMessage: 'Thanks.',
    },
  ],
};

describe('DocApp form path (level 1 parity)', () => {
  it('renders a live FormBlock and persists through createFormServices', async () => {
    const definition = definePrototypeFromDoc(docWithForm, {
      namespace: 'pages-ui-doc-form-test',
      slug: 'doc-form-test',
    });
    const harness = createHarness(definition);
    harnesses.push(harness);
    const runtime = await harness.boot();

    const view = render(DocApp, { props: { doc: docWithForm, runtime } });
    const form = await waitFor(() => {
      const element = view.container.querySelector('[data-py-doc-block-form] form');
      expect(element).not.toBeNull();
      return element as HTMLFormElement;
    });
    expect(form.textContent).not.toContain('Handled by the page form runtime');

    const email = await within(form).findByRole('textbox', { name: /Email/ });
    const submit = within(form).getByRole('button', { name: /^Send$/ });
    await fireEvent.input(email, { target: { value: 'sam@example.com' } });
    await fireEvent.click(submit);
    await waitFor(async () => expect(await responses(runtime)).toHaveLength(1));
    expect(await responses(runtime)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          formId: 'unit-feedback',
          values: expect.objectContaining({ email: 'sam@example.com' }),
        }),
      ])
    );
  });
});
