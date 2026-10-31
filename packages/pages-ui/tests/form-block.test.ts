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

    expect(view.queryByText(/Full name is required/)).toBeNull();
    await fireEvent.click(view.getByRole('button', { name: 'Send message' }));

    // Texuli shows the error under the field and in the focused summary.
    await waitFor(() =>
      expect(view.getAllByText(/Full name is required/).length).toBeGreaterThan(0)
    );
    expect(view.container.querySelector('.tx-forms__summary')).toBeTruthy();
    expect(services.submit).not.toHaveBeenCalled();

    await fireEvent.input(view.getByRole('textbox', { name: /^Full name/ }), {
      target: { value: 'Ada Example' },
    });
    await fireEvent.click(view.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(services.submit).toHaveBeenCalledTimes(1));
    expect(
      view.container.querySelector('[data-tx-forms-field="fullName"] [role="alert"]')
        ?.textContent ?? ''
    ).toBe('');
  });

  it('submits valid values through the service and shows the success message', async () => {
    const submit = vi.fn().mockResolvedValue({ id: 'response-1' });
    const view = render(FormBlock, {
      props: { form: fixtureForm(), services: fakeServices(submit) },
    });

    await fireEvent.input(view.getByRole('textbox', { name: /^Full name/ }), {
      target: { value: 'Ada Example' },
    });
    await fireEvent.click(view.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith('contact-form', {
        fullName: 'Ada Example',
        details: '',
        updates: false,
      })
    );
    expect(submit.mock.calls[0]?.[1]).not.toHaveProperty('topic');
    await waitFor(() =>
      expect(view.getByRole('status').textContent).toContain('Thanks. We received your message.')
    );
    expect(view.container.querySelector('.tx-forms__done')?.textContent).toBe(
      'Thanks. We received your message.'
    );
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

    await fireEvent.input(view.getByRole('textbox', { name: /^Full name/ }), {
      target: { value: 'Ada Example' },
    });
    await fireEvent.click(view.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(view.getAllByText('Use your full name').length).toBeGreaterThan(0));
    expect(view.container.querySelector('.tx-forms__done')).toBeNull();
  });

  it('shows pending feedback while the service promise is unresolved', async () => {
    let finish = (): void => {};
    const submit = vi.fn(
      () => new Promise<{ id: string }>((resolve) => (finish = () => resolve({ id: 'response-1' })))
    );
    const view = render(FormBlock, {
      props: { form: fixtureForm(), services: fakeServices(submit) },
    });
    await fireEvent.input(view.getByRole('textbox', { name: /^Full name/ }), {
      target: { value: 'Ada Example' },
    });
    const button = view.getByRole('button', { name: 'Send message' });
    await fireEvent.click(button);

    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
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

    await fireEvent.input(view.getByRole('textbox', { name: /^Full name/ }), {
      target: { value: 'Ada Example' },
    });
    await fireEvent.click(view.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(submit).toHaveBeenCalled());
    const submitted = submit.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.hasOwn(submitted, '__proto__')).toBe(false);
    expect(Object.getPrototypeOf(submitted)).toBe(Object.prototype);
    expect(view.queryByText('Topic')).toBeNull();
  });

  it('names an untitled form by its submit label and hides the duplicate heading', () => {
    const { title: _title, ...untitled } = fixtureForm();
    const view = render(FormBlock, { props: { form: untitled, services: fakeServices() } });
    const form = view.container.querySelector('form[data-py-form="contact-form"]');
    expect(view.getByRole('form', { name: 'Send message' })).toBe(form);
    expect(form?.hasAttribute('data-py-form-untitled')).toBe(true);
    // Texuli hides the title visually and keeps it as the name (G114).
    const heading = form?.querySelector('.tx-forms__title') as HTMLElement;
    expect(heading.className).toMatch(/sr-only|visually-hidden/);
  });

  it('maps every field type to Texuli and the response back to service values', async () => {
    const { formBlockResponse, formBlockSchema } = await import('../src/form/schema.ts');
    const { validateFormSchema } = await import('@texuli/forms/model');
    const form: FormBlockData = {
      ...fixtureForm(),
      fields: [
        { name: 'name', label: 'Name', type: 'text', maxLength: 40, required: true },
        { name: 'email', label: 'Email', type: 'email', help: 'We reply here' },
        { name: 'site', label: 'Site', type: 'url' },
        { name: 'phone', label: 'Phone', type: 'phone' },
        { name: 'seats', label: 'Seats', type: 'number', min: 1, max: 9 },
        { name: 'agree', label: 'I agree', type: 'boolean', required: true },
        {
          name: 'plan',
          label: 'Plan',
          type: 'enum',
          options: [
            { value: 'free', label: 'Free' },
            { value: 'team', label: 'Team' },
          ],
        },
        { name: 'topics', label: 'Topics', type: 'tags', maxTags: 3 },
        { name: 'notes', label: 'Notes', type: 'longText' },
      ],
    };
    const schema = formBlockSchema(form);
    expect(validateFormSchema(schema).issues).toEqual([]);
    expect(schema.fields?.map((field) => [field.name, field.type])).toEqual([
      ['name', 'text'],
      ['email', 'email'],
      ['site', 'url'],
      ['phone', 'text'],
      ['seats', 'number'],
      ['agree', 'checkbox'],
      ['plan', 'select'],
      ['topics', 'tags'],
      ['notes', 'textarea'],
    ]);
    expect(schema.fields?.[0]).toMatchObject({ required: true, maxLength: 40 });
    expect(schema.fields?.[1]).toMatchObject({ description: 'We reply here' });
    expect(schema.fields?.[4]).toMatchObject({ min: 1, max: 9 });
    expect(schema.fields?.[7]).toMatchObject({ maxItems: 3 });
    expect(schema.fields?.[2]).toMatchObject({ protocols: ['http', 'https'] });
    expect(
      formBlockResponse(form, {
        name: 'Ada',
        email: '',
        seats: null,
        agree: true,
        plan: null,
        topics: ['a'],
        notes: 'Hi',
        extra: 'dropped',
      })
    ).toEqual({ name: 'Ada', email: '', agree: true, topics: ['a'], notes: 'Hi' });
  });
});
