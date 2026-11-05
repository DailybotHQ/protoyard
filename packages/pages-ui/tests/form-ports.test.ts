import type { FormBlock as FormBlockData } from '@protoyard/blocks';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import FormBlock from '../src/form/FormBlock.svelte';
import type { FormPort, FormResponse } from '../src/form/index.ts';

afterEach(cleanup);

/**
 * ADR-046 / Dailybot G-030: a page form submits into a product's own store
 * through FormPort, with no Protoyard runtime or form services.
 */
describe('pages-ui forms on a product port', () => {
  it("submits into the product's own store", async () => {
    const leads: Array<{ form: string; values: unknown }> = [];
    const port: FormPort = {
      async submit(formId, values) {
        leads.push({ form: formId, values });
        return {
          id: `lead-${leads.length}`,
          formId,
          values,
          createdAt: '2026-01-01T00:00:00.000Z',
        } as unknown as FormResponse;
      },
    };
    const form: FormBlockData = {
      type: 'form',
      id: 'waitlist',
      title: 'Join the waitlist',
      submitLabel: 'Join',
      successMessage: 'You are on the list.',
      fields: [{ name: 'email', label: 'Email', type: 'text', required: true }],
    };
    const view = render(FormBlock, { props: { form, services: port } });
    await fireEvent.input(view.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'ada@example.com' },
    });
    await fireEvent.click(view.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(leads).toHaveLength(1));
    expect(leads[0]).toMatchObject({ form: 'waitlist', values: { email: 'ada@example.com' } });
  });
});
