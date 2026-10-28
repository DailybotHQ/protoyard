import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OtpInput from '../src/components/otp-input/OtpInput.svelte';
import * as barrel from '../src/index.ts';

afterEach(() => cleanup());

// OtpInput is Texuli's PinInput: one real, labelled input drawn as cells.
function field(label = 'Verification code'): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function cellsOf(input: HTMLInputElement): Element[] {
  return [
    ...(input.closest('[data-pin-input-root]')?.querySelectorAll('.tx-pin-input__cell') ?? []),
  ];
}

async function type(input: HTMLInputElement, value: string): Promise<void> {
  await fireEvent.input(input, { target: { value } });
}

async function paste(input: HTMLInputElement, text: string): Promise<void> {
  input.setSelectionRange(input.value.length, input.value.length);
  await fireEvent.paste(input, {
    clipboardData: { getData: () => text },
  } as unknown as ClipboardEvent);
}

describe('OtpInput', () => {
  it('draws one cell per character and fires onComplete exactly once per full code', async () => {
    const onComplete = vi.fn();
    const onValueChange = vi.fn();
    render(OtpInput, {
      label: 'Verification code',
      length: 4,
      value: '',
      autofocus: false,
      onComplete,
      onValueChange,
    });
    const input = field();
    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(cellsOf(input)).toHaveLength(4);

    await type(input, '1');
    expect(onValueChange).toHaveBeenLastCalledWith('1');
    await type(input, '1234');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('1234');

    // Still the same full code: no second call.
    await type(input, '1234');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('pastes a full code, keeping only allowed characters', async () => {
    const onComplete = vi.fn();
    render(OtpInput, {
      label: 'Verification code',
      length: 6,
      value: '',
      autofocus: false,
      onComplete,
    });
    const input = field();
    await paste(input, '98-76 54');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('987654');
    expect(input.value).toBe('987654');
  });

  it('rejects characters outside the pattern', async () => {
    const onValueChange = vi.fn();
    render(OtpInput, { label: 'Code', length: 4, value: '12', autofocus: false, onValueChange });
    const input = field('Code');
    await type(input, '12a');
    expect(onValueChange).not.toHaveBeenCalled();
    await type(input, '1');
    expect(onValueChange).toHaveBeenCalledWith('1');
  });

  it('respects disabled', () => {
    render(OtpInput, {
      label: 'Team invite code',
      length: 3,
      value: '',
      disabled: true,
      autofocus: false,
    });
    expect(field('Team invite code').disabled).toBe(true);
  });

  it('supports the alphanumeric pattern (upper-cased) and a configurable length', async () => {
    const onComplete = vi.fn();
    render(OtpInput, {
      label: 'Backup code',
      length: 5,
      pattern: 'alphanumeric',
      value: '',
      autofocus: false,
      onComplete,
    });
    const input = field('Backup code');
    expect(cellsOf(input)).toHaveLength(5);
    await type(input, 'a');
    await paste(input, 'b2c3');
    expect(onComplete).toHaveBeenCalledWith('AB2C3');
  });

  it('re-fires onComplete only after the code changes away from complete and back', async () => {
    const onComplete = vi.fn();
    render(OtpInput, {
      label: 'Verification code',
      length: 3,
      value: '111',
      autofocus: false,
      onComplete,
    });
    // A code that was already full does not fire on mount.
    expect(onComplete).not.toHaveBeenCalled();
    const input = field();
    await type(input, '11');
    await type(input, '112');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('112');
  });

  it('focuses the field on mount unless autofocus is false', () => {
    render(OtpInput, { label: 'Verification code', value: '' });
    expect(document.activeElement).toBe(field());
  });
});

describe('OtpInput barrel', () => {
  it('exports OtpInput from @protoyard/ui', () => {
    expect(barrel.OtpInput).toBeTruthy();
  });
});
