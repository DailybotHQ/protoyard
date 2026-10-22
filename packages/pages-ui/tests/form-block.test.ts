import type { FormBlock as FormBlockData } from '@protoyard/blocks';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FormBlock from '../src/form/FormBlock.svelte';

afterEach(cleanup);

function fixtureForm(): FormBlockData {
  return {
    type: 'form',
    id: 'contact-form',
    title: 'Contact us',
    description: 'Tell us how to reach you.',
    fields: [
      { name: 'fullName', label: 'Full name', type: 'text', required: true },
      {
        name: 'topic',
        label: 'Topic',
        type: 'enum',
        required: false,
        options: [
          { value: 'question', label: 'Question' },
          { value: 'feedback', label: 'Feedback' },
        ],
      },
      { name: 'details', label: 'Details', type: 'longText', required: false },
      { name: 'updates', label: 'Send me updates', type: 'boolean', required: false },
    ],
    submitLabel: 'Send message',
    successMessage: 'Thanks. We received your message.',
  };
}

function fakeServices(submit = vi.fn().mockResolvedValue({ id: 'response-1' })) {
  return { submit };
}

describe('FormBlock', () => {
  it('shows required errors only after the first submit attempt', async () => {
    const services = fakeServices();
    const view = render(FormBlock, { props: { form: fixtureForm(), services } });

    expect(view.queryByText('Full name is required')).toBeNull();
    await fireEvent.click(view.getByRole('button', { name: 'Send message' }));

    expect(view.getByText('Full name is required')).toBeTruthy();
    expect(services.submit).not.toHaveBeenCalled();

    await fireEvent.input(view.getByRole('textbox', { name: 'Full name' }), {
      target: { value: 'Ada Example' },
    });
    expect(view.queryByText('Full name is required')).toBeNull();
  });

  it('submits valid values through the service and shows the success message', async () => {
    const submit = vi.fn().mockResolvedValue({ id: 'response-1' });
    const view = render(FormBlock, {
      props: { form: fixtureForm(), services: fakeServices(submit) },
    });

    await fireEvent.input(view.getByRole('textbox', { name: 'Full name' }), {
      target: { value: 'Ada Example' },
    });
    await fireEvent.click(view.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        'contact-form',
        expect.objectContaining({ fullName: 'Ada Example' })
      )
    );
    expect(submit.mock.calls[0]?.[1]).not.toHaveProperty('topic');
    expect(view.getByRole('status').textContent).toContain('Thanks. We received your message.');
  });

  it('maps service validation errors to the matching field', async () => {
    const submit = vi.fn().mockRejectedValue(
      Object.assign(new Error('Invalid email'), {
        issues: { fullName: 'Use your full name' },
      })
    );
    const view = render(FormBlock, {
      props: { form: fixtureForm(), services: fakeServices(submit) },
    });

    await fireEvent.input(view.getByRole('textbox', { name: 'Full name' }), {
      target: { value: 'Ada Example' },
    });
    await fireEvent.click(view.getByRole('button', { name: 'Send message' }));

    expect(await view.findByText('Use your full name')).toBeTruthy();
    expect(view.queryByRole('status')).toBeNull();
  });

  it('shows pending feedback while the service promise is unresolved', async () => {
    let finish = (): void => {};
    const submit = vi.fn(
      () => new Promise<{ id: string }>((resolve) => (finish = () => resolve({ id: 'response-1' })))
    );
    const view = render(FormBlock, {
      props: { form: fixtureForm(), services: fakeServices(submit) },
    });
    await fireEvent.input(view.getByRole('textbox', { name: 'Full name' }), {
      target: { value: 'Ada Example' },
    });
    await fireEvent.click(view.getByRole('button', { name: 'Send message' }));

    const button = view.getByRole('button', { name: 'Send message' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(true);
    finish();
    await waitFor(() => expect(view.getByRole('status').textContent).toContain('Thanks.'));
  });

  it('ignores unsafe field names instead of creating object properties', async () => {
    const form = fixtureForm();
    const unsafe = {
      ...form,
      fields: [form.fields[0], { ...form.fields[1], name: '__proto__' }],
    } as unknown as FormBlockData;
    const submit = vi.fn().mockResolvedValue({ id: 'response-1' });
    const view = render(FormBlock, { props: { form: unsafe, services: fakeServices(submit) } });

    await fireEvent.input(view.getByRole('textbox', { name: 'Full name' }), {
      target: { value: 'Ada Example' },
    });
    await fireEvent.click(view.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(submit).toHaveBeenCalled());
    const submitted = submit.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.hasOwn(submitted, '__proto__')).toBe(false);
    expect(Object.getPrototypeOf(submitted)).toBe(Object.prototype);
    expect(view.queryByText('Topic')).toBeNull();
  });
});
