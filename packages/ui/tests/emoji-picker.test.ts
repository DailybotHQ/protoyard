import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EmojiInFormHarness from './fixtures/EmojiInFormHarness.svelte';

afterEach(cleanup);

describe('EmojiPicker inside a form (Dailybot G-051)', () => {
  it('keeps Enter in its search instead of submitting the form', async () => {
    const onsubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
    render(EmojiInFormHarness, { props: { onsubmit } });
    await fireEvent.click(screen.getByRole('button', { name: /Reaction/ }));
    const search = await screen.findByRole('searchbox');
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    search.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(onsubmit).not.toHaveBeenCalled();
  });
});

describe('EmojiPicker trigger name (Dailybot batch 6)', () => {
  it('includes the visible prompt when a Field labels it', async () => {
    const { EmojiPicker } = await import('../src/index.ts');
    const label = document.createElement('span');
    label.id = 'field-label';
    label.textContent = 'Reaction';
    document.body.append(label);
    render(EmojiPicker, {
      props: { 'aria-labelledby': 'field-label', placeholder: 'Pick an emoji' },
    });
    const trigger = screen.getByRole('button', { name: 'Reaction Pick an emoji' });
    expect(trigger.textContent).toContain('Pick an emoji');
    label.remove();
  });

  it('names a chosen emoji with its own label', () => {
    return import('../src/index.ts').then(({ EmojiPicker }) => {
      render(EmojiPicker, { props: { label: 'Mood', value: '🎉' } });
      expect(screen.getByRole('button', { name: 'Mood 🎉' })).toBeTruthy();
    });
  });
});
