import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeekdayPicker } from '../src/index.ts';
import DialogFocusHarness from './fixtures/DialogFocusHarness.svelte';

afterEach(cleanup);

describe('WeekdayPicker names (WCAG 2.5.3)', () => {
  it('names each day with its visible text first, then the long name, and no aria-label', () => {
    render(WeekdayPicker, { props: { label: 'Days' } });
    const monday = document.querySelector('[data-weekday="1"]') as HTMLElement;
    expect(monday.getAttribute('aria-label')).toBeNull();
    const long = monday.querySelector('.ui-weekday-picker__long')?.textContent ?? '';
    const name = monday.textContent ?? '';
    const visible = name.slice(0, name.length - long.length).trim();
    expect(visible).toBe('Mon');
    expect(name.replace(/\s+/g, ' ').trim()).toBe('Mon Monday');
  });
});

describe('Dialog onCloseAutoFocus', () => {
  it('calls the caller first, and lets preventDefault keep focus where the caller put it', async () => {
    const onCloseAutoFocus = vi.fn((event: { preventDefault(): void }) => event.preventDefault());
    render(DialogFocusHarness, { props: { onCloseAutoFocus } });
    await fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalledTimes(1));
  });
});
