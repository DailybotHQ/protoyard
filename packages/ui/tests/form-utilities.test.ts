import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EmojiPicker from '../src/components/form/utilities/EmojiPicker.svelte';
import { isEmailAddress, splitTagTokens } from '../src/components/form/utilities/email.ts';
import PasswordStrengthMeter from '../src/components/form/utilities/PasswordStrengthMeter.svelte';
import { PASSWORD_RULES, passwordScore } from '../src/components/form/utilities/password-score.ts';
import TagEmailInput from '../src/components/form/utilities/TagEmailInput.svelte';
import TextCounter from '../src/components/form/utilities/TextCounter.svelte';
import * as barrel from '../src/index.ts';

afterEach(() => cleanup());

describe('email helpers', () => {
  it('accepts simple addresses and splits paste lists', () => {
    expect(isEmailAddress('ada@example.com')).toBe(true);
    expect(isEmailAddress('not-an-email')).toBe(false);
    expect(isEmailAddress('a@b')).toBe(false);
    expect(splitTagTokens('ada@example.com, bob@example.com; cara@example.com')).toEqual([
      'ada@example.com',
      'bob@example.com',
      'cara@example.com',
    ]);
  });
});

describe('TagEmailInput', () => {
  it('adds tags on Enter and removes them with the button or Backspace', async () => {
    const onValueChange = vi.fn();
    render(TagEmailInput, {
      label: 'Invite',
      value: [],
      onValueChange,
    });
    const input = screen.getByRole('textbox', { name: 'Invite' });
    await fireEvent.input(input, { target: { value: 'ada@example.com' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(onValueChange).toHaveBeenCalledWith(['ada@example.com']);
    expect(screen.getByText('ada@example.com')).toBeTruthy();

    // Re-render with the committed value to exercise remove.
    cleanup();
    const onRemove = vi.fn();
    render(TagEmailInput, {
      label: 'Invite',
      value: ['ada@example.com', 'bob@example.com'],
      onValueChange: onRemove,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Remove ada@example.com' }));
    expect(onRemove).toHaveBeenCalledWith(['bob@example.com']);

    cleanup();
    const onBackspace = vi.fn();
    render(TagEmailInput, {
      label: 'Invite',
      value: ['cara@example.com'],
      onValueChange: onBackspace,
    });
    const field = screen.getByRole('textbox', { name: 'Invite' });
    await fireEvent.keyDown(field, { key: 'Backspace' });
    expect(onBackspace).toHaveBeenCalledWith([]);
  });

  it('rejects invalid and duplicate emails with inline feedback', async () => {
    const onDuplicate = vi.fn();
    render(TagEmailInput, {
      label: 'Invite',
      value: ['ada@example.com'],
      onDuplicate,
    });
    const input = screen.getByRole('textbox', { name: 'Invite' });
    await fireEvent.input(input, { target: { value: 'not-valid' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toMatch(/valid email/i);

    await fireEvent.input(input, { target: { value: 'ada@example.com' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(onDuplicate).toHaveBeenCalledWith('ada@example.com');
    expect(screen.getByRole('alert').textContent).toMatch(/already/i);
  });

  it('accepts free-form tags when validation is ignored', async () => {
    const onValueChange = vi.fn();
    render(TagEmailInput, {
      label: 'Tags',
      value: [],
      ignoreValidation: true,
      onValueChange,
    });
    const input = screen.getByRole('textbox', { name: 'Tags' });
    await fireEvent.input(input, { target: { value: 'design' } });
    await fireEvent.keyDown(input, { key: ' ' });
    expect(onValueChange).toHaveBeenCalledWith(['design']);
  });
});

describe('EmojiPicker', () => {
  it('opens, searches, picks with the keyboard and closes on Escape', async () => {
    const onValueChange = vi.fn();
    render(EmojiPicker, {
      label: 'Reaction',
      value: '',
      onValueChange,
    });
    const trigger = screen.getByRole('button', { name: 'Reaction' });
    await fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const dialog = screen.getByRole('dialog', { name: 'Reaction' });
    const search = within(dialog).getByRole('searchbox', { name: 'Search emoji' });
    await fireEvent.input(search, { target: { value: 'thumbs up' } });
    const cell = within(dialog).getByRole('button', { name: 'thumbs up' });
    await fireEvent.click(cell);
    expect(onValueChange).toHaveBeenCalledWith('👍');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await fireEvent.click(trigger);
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('passwordScore and PasswordStrengthMeter', () => {
  it('scores empty and strong passwords without mutating the input', () => {
    expect(passwordScore('')).toEqual({ score: 0, failed: [], messages: [] });
    const weak = passwordScore('short');
    expect(weak.score).toBeLessThan(5);
    expect(weak.failed.length).toBeGreaterThan(0);
    const strong = passwordScore('Correct-Horse-Battery-9!');
    expect(strong.score).toBe(5);
    expect(strong.failed).toEqual([]);
    expect(PASSWORD_RULES).toHaveLength(6);
  });

  it('exposes a meter and never claims persistence', async () => {
    const onScore = vi.fn();
    const onFeedback = vi.fn();
    const { container, rerender } = render(PasswordStrengthMeter, {
      value: 'abc',
      onScore,
      onFeedback,
    });
    const meter = screen.getByRole('meter', { name: 'Password strength' });
    expect(meter.getAttribute('aria-valuemax')).toBe('5');
    expect(Number(meter.getAttribute('aria-valuenow'))).toBeLessThan(5);
    expect(onScore).toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/stored|saved|sent|hashed/i);

    await rerender({ value: 'Correct-Horse-Battery-9!', onScore, onFeedback });
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('5');
    expect(screen.getByRole('meter').getAttribute('aria-valuetext')).toBe('Strong');
  });
});

describe('TextCounter', () => {
  it('shows remaining characters while focused near the limit', async () => {
    render(TextCounter, {
      label: 'Bio',
      value: 'hello',
      maxlength: 10,
      showAfter: 8,
    });
    const field = screen.getByRole('textbox', { name: 'Bio' });
    expect(screen.queryByText(/characters left/)).toBeTruthy();
    // Hidden until focused and under the threshold.
    await fireEvent.focus(field);
    await fireEvent.input(field, { target: { value: 'helloworld' } });
    // 0 remaining once at maxlength
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText(/characters left/)).toBeTruthy();
  });

  it('caps input at maxlength and supports textarea', async () => {
    const onValueChange = vi.fn();
    render(TextCounter, {
      label: 'Note',
      tag: 'textarea',
      value: '',
      maxlength: 5,
      onValueChange,
    });
    const field = screen.getByRole('textbox', { name: 'Note' });
    await fireEvent.input(field, { target: { value: 'abcdef' } });
    expect(onValueChange).toHaveBeenCalledWith('abcde');
  });
});

describe('form utilities barrel', () => {
  it('re-exports the utilities from @protoyard/ui', () => {
    expect(barrel.TagEmailInput).toBeTruthy();
    expect(barrel.EmojiPicker).toBeTruthy();
    expect(barrel.PasswordStrengthMeter).toBeTruthy();
    expect(barrel.TextCounter).toBeTruthy();
    expect(typeof barrel.passwordScore).toBe('function');
    expect(typeof barrel.isEmailAddress).toBe('function');
    expect(barrel.EMOJI_GROUPS.length).toBeGreaterThan(0);
  });
});
