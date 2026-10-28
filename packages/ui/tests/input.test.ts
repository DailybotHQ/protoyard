import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
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
});
