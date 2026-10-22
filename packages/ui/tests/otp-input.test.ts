import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OtpInput from '../src/components/otp-input/OtpInput.svelte';
import * as barrel from '../src/index.ts';

afterEach(() => cleanup());

function cells(label = 'Verification code'): HTMLInputElement[] {
  const fieldset = screen.getByRole('group', { name: label });
  return within(fieldset).getAllByRole('textbox') as HTMLInputElement[];
}

describe('OtpInput', () => {
  it('types digits, moves focus forward and fires onComplete exactly once', async () => {
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
    const inputs = cells();
    expect(inputs).toHaveLength(4);
    expect(screen.getByText('Verification code').tagName).toBe('LEGEND');

    await fireEvent.input(inputs[0]!, { target: { value: '1' } });
    expect(onValueChange).toHaveBeenLastCalledWith('1');
    expect(document.activeElement).toBe(inputs[1]);

    await fireEvent.input(inputs[1]!, { target: { value: '2' } });
    await fireEvent.input(inputs[2]!, { target: { value: '3' } });
    await fireEvent.input(inputs[3]!, { target: { value: '4' } });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('1234');

    // Still full — do not fire again for the same code.
    await fireEvent.input(inputs[3]!, { target: { value: '4' } });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('pastes a full code from the first cell', async () => {
    const onComplete = vi.fn();
    render(OtpInput, {
      label: 'Verification code',
      length: 6,
      value: '',
      autofocus: false,
      onComplete,
    });
    const inputs = cells();
    const clipboardData = {
      getData: () => '98-76 54',
    };
    await fireEvent.paste(inputs[0]!, { clipboardData } as unknown as ClipboardEvent);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('987654');
    expect(inputs.map((input) => input.value).join('')).toBe('987654');
  });

  it('moves with arrows and backspace', async () => {
    const onValueChange = vi.fn();
    render(OtpInput, {
      label: 'Code',
      length: 4,
      value: '12',
      autofocus: false,
      onValueChange,
    });
    const inputs = cells('Code');
    inputs[1]!.focus();
    await fireEvent.keyDown(inputs[1]!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(inputs[0]);
    await fireEvent.keyDown(inputs[0]!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(inputs[1]);
    await fireEvent.keyDown(inputs[1]!, { key: 'End' });
    expect(document.activeElement).toBe(inputs[3]);
    await fireEvent.keyDown(inputs[3]!, { key: 'Home' });
    expect(document.activeElement).toBe(inputs[0]);

    inputs[1]!.focus();
    await fireEvent.keyDown(inputs[1]!, { key: 'Backspace' });
    expect(onValueChange).toHaveBeenCalledWith('1');
  });

  it('respects disabled and keeps an accessible label per digit', () => {
    render(OtpInput, {
      label: 'Team invite code',
      length: 3,
      value: '',
      disabled: true,
      autofocus: false,
    });
    const fieldset = screen.getByRole('group', { name: 'Team invite code' });
    expect(fieldset.tagName).toBe('FIELDSET');
    expect((fieldset as HTMLFieldSetElement).disabled).toBe(true);
    for (const digit of [1, 2, 3]) {
      expect((screen.getByLabelText(`Digit ${digit} of 3`) as HTMLInputElement).disabled).toBe(
        true
      );
    }
  });

  it('supports alphanumeric pattern and configurable length', async () => {
    const onComplete = vi.fn();
    render(OtpInput, {
      label: 'Backup code',
      length: 5,
      pattern: 'alphanumeric',
      value: '',
      autofocus: false,
      onComplete,
    });
    const inputs = cells('Backup code');
    expect(inputs).toHaveLength(5);
    await fireEvent.input(inputs[0]!, { target: { value: 'a' } });
    await fireEvent.paste(inputs[1]!, {
      clipboardData: { getData: () => 'b2c3' },
    } as unknown as ClipboardEvent);
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
    // Initial full value does not auto-fire (user already had it).
    expect(onComplete).not.toHaveBeenCalled();
    const inputs = cells();
    await fireEvent.keyDown(inputs[2]!, { key: 'Backspace' });
    await fireEvent.input(inputs[2]!, { target: { value: '2' } });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('112');
  });
});

describe('OtpInput barrel', () => {
  it('exports OtpInput from @protoyard/ui', () => {
    expect(barrel.OtpInput).toBeTruthy();
  });
});
