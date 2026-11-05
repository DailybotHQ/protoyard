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
