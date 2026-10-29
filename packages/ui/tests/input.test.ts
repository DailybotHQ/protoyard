import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Input from '../src/components/input/Input.svelte';
import Select from '../src/components/select/Select.svelte';
import UserPicker from '../src/components/user-picker/UserPicker.svelte';
import InputHarness from './fixtures/InputHarness.svelte';

afterEach(() => cleanup());

describe('Input (adapter over Texuli Input)', () => {
  it('keeps bind:value working next to a caller oninput, which sees the new value', async () => {
    render(InputHarness);
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input.dataset.txInput).toBe('');
    await fireEvent.input(input, { target: { value: 'Acme' } });
    expect(screen.getByTestId('text').textContent).toBe('Acme');
    expect(screen.getByTestId('seen').textContent).toBe('Acme');
  });

  it('binds a number for number inputs, and null when cleared', async () => {
    render(InputHarness);
    const amount = screen.getByRole('spinbutton', { name: 'Amount' }) as HTMLInputElement;
    expect(amount.value).toBe('5');
    await fireEvent.input(amount, { target: { value: '42' } });
    expect(screen.getByTestId('amount').textContent).toBe('number:42');
    await fireEvent.input(amount, { target: { value: '' } });
    expect(screen.getByTestId('amount').textContent).toBe('null');
  });

  it('keeps the ui-input hook the input style profiles (filled, underline) target', () => {
    render(Input, { 'aria-label': 'Email', class: 'w-full' } as never);
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input.classList.contains('ui-input')).toBe(true);
    expect(input.classList.contains('w-full')).toBe(true);
  });
});

describe('placeholders look like placeholders', () => {
  it('Select mutes its placeholder with Texuli’s placeholder class until a value is chosen', () => {
    render(Select, {
      items: [{ value: 'open', label: 'Open' }],
      placeholder: 'Status',
      'aria-label': 'Status',
    } as never);
    const value = screen.getByText('Status', { selector: '.tx-select-value' });
    expect(value.classList.contains('tx-select-value--placeholder')).toBe(true);
  });

  it('UserPicker mutes its placeholder the same way', () => {
    render(UserPicker, {
      users: [{ id: 'u1', name: 'Ada Lovelace' }],
      placeholder: 'Assign someone',
      label: 'Owner',
    } as never);
    const value = screen.getByText('Assign someone', { selector: '.tx-select-value' });
    expect(value.classList.contains('tx-select-value--placeholder')).toBe(true);
  });
});
