import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { SchemaForm } from '@texuli/forms';
import { validateFormSchema } from '@texuli/forms/model';
import { afterEach, describe, expect, it } from 'vitest';
import DisabledOnMountHarness from './fixtures/DisabledOnMountHarness.svelte';

afterEach(() => cleanup());

const compiled = validateFormSchema(
  {
    title: 'Gap repro',
    submitLabel: 'Send',
    fields: [{ name: 'code', type: 'otp', label: 'Code', required: true, length: 6 }],
  },
  { tier: 'developer' }
);
if (!compiled.ok) throw new Error('The repro form is invalid');
const form = compiled.form;

describe('@texuli/forms gaps the SaaS kit works around', () => {
  // G134: the MFA screen remounts its form (keyed on the challenge) until this passes.
  it.fails('G134: a SchemaForm that mounts disabled enables again when the prop turns false', async () => {
    render(DisabledOnMountHarness, { props: { form } });
    const send = () => screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    expect(send().disabled).toBe(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Enable' }));
    expect(send().disabled).toBe(false);
  });

  // G131: the phone sign-in paints its number with TelInput until Texuli has a telephone field.
  it.fails('G131: a phone-format text field opens the telephone keypad', () => {
    const phone = validateFormSchema({
      title: 'Phone',
      fields: [{ name: 'phone', type: 'text', format: 'phone', label: 'Phone number' }],
    });
    if (!phone.ok) throw new Error('The repro form is invalid');
    render(SchemaForm, { props: { form: phone.form } });
    const input = screen.getByLabelText(/^Phone number/, { selector: 'input' });
    expect(input.getAttribute('inputmode') ?? input.getAttribute('type')).toBe('tel');
  });

  it('control: a SchemaForm that mounts enabled can be disabled and enabled again', async () => {
    const view = render(SchemaForm, { props: { form, disabled: false } });
    const send = () => screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    await view.rerender({ form, disabled: true });
    expect(send().disabled).toBe(true);
    await view.rerender({ form, disabled: false });
    expect(send().disabled).toBe(false);
  });
});
