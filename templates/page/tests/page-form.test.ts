import type { PrototypeRuntime } from '@protoyard/core';
import { PageApp } from '@protoyard/pages-ui/page';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { definition, pageDocument } from '../src/prototype.ts';

/*
 * Level 2 works like level 1: the page form in this template (and in every
 * page generated from it) is enabled, validates, and saves its response
 * through the kind runtime (service → zod → environment.run → db.transaction).
 * It once rendered the disabled block preview ("Handled by the page form
 * runtime") because PageApp never provided its form services.
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

describe('templates/page level-2 form', () => {
  it('accepts input, validates and persists a response through the kind runtime', async () => {
    const harness = createHarness(definition);
    harnesses.push(harness);
    const runtime = await harness.boot();

    const view = render(PageApp, { props: { page: pageDocument, runtime } });
    const form = await waitFor(() => {
      const element = view.container.querySelector('[data-py-page-block="form"] form');
      expect(element).not.toBeNull();
      return element as HTMLFormElement;
    });
    expect(form.textContent).not.toContain('Handled by the page form runtime');

    const email = await within(form).findByRole('textbox', { name: /Email/ });
    expect((email as HTMLInputElement).disabled).toBe(false);
    const submit = within(form).getByRole('button', { name: /Join the waitlist/ });

    // Required fields are checked before anything is saved.
    await fireEvent.click(submit);
    await within(form).findByText(/Email is required/);
    expect(await responses(runtime)).toHaveLength(0);

    await fireEvent.input(email, { target: { value: 'ada@example.com' } });
    await fireEvent.click(submit);
    await waitFor(async () => expect(await responses(runtime)).toHaveLength(1));
    const [row] = await responses(runtime);
    expect(row).toMatchObject({
      formId: 'waitlist-form',
      values: expect.objectContaining({ email: 'ada@example.com' }),
    });
  });
});
