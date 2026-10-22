import type { PrototypeRuntime } from '@protoyard/core';
import { DocApp } from '@protoyard/pages-ui/doc';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { definition, docDocument } from '../src/prototype.ts';

/*
 * Level 2 works like level 1: a form block in this document is enabled,
 * validates, and saves through the kind runtime (service → zod →
 * environment.run → db.transaction). It once stayed on the disabled
 * blocks-ui placeholder because DocHost never mounted FormBlock.
 */

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

describe('templates/doc level-2 form', () => {
  it('accepts input, validates and persists a response through the kind runtime', async () => {
    const harness = createHarness(definition);
    harnesses.push(harness);
    const runtime = await harness.boot();

    const view = render(DocApp, { props: { doc: docDocument, runtime } });
    const form = await waitFor(() => {
      const element = view.container.querySelector(
        '[data-py-doc-block-form] form, [data-py-doc-block="form"] form'
      );
      expect(element).not.toBeNull();
      return element as HTMLFormElement;
    });
    expect(form.textContent).not.toContain('Handled by the page form runtime');

    const email = await within(form).findByRole('textbox', { name: /Email/ });
    expect((email as HTMLInputElement).disabled).toBe(false);
    const submit = within(form).getByRole('button', { name: /Send feedback/ });

    await fireEvent.click(submit);
    await within(form).findByText(/Email is required/);
    expect(await responses(runtime)).toHaveLength(0);

    await fireEvent.input(email, { target: { value: 'jordan@example.com' } });
    await fireEvent.click(submit);
    await waitFor(async () => expect(await responses(runtime)).toHaveLength(1));
    const [row] = await responses(runtime);
    expect(row).toMatchObject({
      formId: 'reader-feedback',
      values: expect.objectContaining({ email: 'jordan@example.com' }),
    });

    // Reload the same world: the row is still there (IndexedDB persistence).
    const reloaded = await harness.reload(runtime);
    expect(await responses(reloaded)).toHaveLength(1);
  });
});
