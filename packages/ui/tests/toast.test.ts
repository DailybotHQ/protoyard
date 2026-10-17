import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Toaster from '../src/components/toast/Toaster.svelte';
import { MAX_TOASTS, toast } from '../src/components/toast/toast.svelte.ts';

beforeEach(() => {
  vi.useFakeTimers();
  toast.dismiss();
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.useRealTimers();
});

describe('toast store', () => {
  it('pushes typed toasts with descriptions and returns ids', () => {
    const id = toast.success('Saved', { description: 'All changes stored.' });
    toast.error('Failed');
    toast.info('Heads up');
    expect(toast.items.map((t) => t.kind)).toEqual(['success', 'error', 'info']);
    expect(toast.items[0]).toMatchObject({
      id,
      title: 'Saved',
      description: 'All changes stored.',
    });
  });

  it('dismisses by id and clears everything without an id', () => {
    const first = toast.info('One');
    toast.info('Two');
    toast.dismiss(first);
    expect(toast.items.map((t) => t.title)).toEqual(['Two']);
    toast.dismiss();
    expect(toast.items).toHaveLength(0);
  });

  it('auto-dismisses after the duration', () => {
    toast.success('Saved', { duration: 1000 });
    toast.info('Sticky', { duration: 0 });
    vi.advanceTimersByTime(999);
    expect(toast.items).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(toast.items.map((t) => t.title)).toEqual(['Sticky']);
    vi.advanceTimersByTime(60_000);
    expect(toast.items).toHaveLength(1);
  });

  it('pausing freezes the countdown and resuming continues with the remaining time', () => {
    toast.info('Hello', { duration: 1000 });
    vi.advanceTimersByTime(600);
    toast.pause();
    vi.advanceTimersByTime(5000);
    expect(toast.items).toHaveLength(1);
    toast.resume();
    vi.advanceTimersByTime(399);
    expect(toast.items).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toast.items).toHaveLength(0);
  });

  it('replaces a toast that reuses an id and caps the stack', () => {
    toast.info('Saving…', { id: 'save', duration: 0 });
    toast.success('Saved', { id: 'save' });
    expect(toast.items).toHaveLength(1);
    expect(toast.items[0]).toMatchObject({ id: 'save', kind: 'success', title: 'Saved' });
    for (let i = 0; i < MAX_TOASTS + 2; i++) toast.info(`n${i}`);
    expect(toast.items).toHaveLength(MAX_TOASTS);
    expect(toast.items.at(-1)?.title).toBe(`n${MAX_TOASTS + 1}`);
  });

  it('announces errors assertively and others politely', () => {
    toast.success('Saved');
    expect(toast.announcement).toMatchObject({ text: 'Saved', assertive: false });
    toast.error('Failed', { description: 'Try again' });
    expect(toast.announcement).toMatchObject({ text: 'Failed. Try again', assertive: true });
  });
});

describe('Toaster', () => {
  it('renders toasts, announces them and closes via the dismiss button', async () => {
    render(Toaster, {});
    toast.error('Upload failed', { description: 'File too large' });
    flushSync();
    expect(screen.getByText('Upload failed')).toBeTruthy();
    const assertive = document.querySelector('[aria-live="assertive"]');
    expect(assertive?.textContent).toBe('Upload failed. File too large');

    await fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss notification: Upload failed' })
    );
    expect(screen.queryByText('Upload failed')).toBeNull();
  });

  it('pauses auto-dismiss while hovered', async () => {
    render(Toaster, {});
    toast.success('Hover me', { duration: 1000 });
    flushSync();
    const region = screen.getByRole('region', { name: 'Notifications' });
    const list = within(region).getByText('Hover me').closest('ol') as HTMLElement;
    await fireEvent.mouseEnter(list);
    vi.advanceTimersByTime(3000);
    flushSync();
    expect(within(region).getByText('Hover me')).toBeTruthy();
    await fireEvent.mouseLeave(list);
    vi.advanceTimersByTime(1000);
    flushSync();
    expect(within(region).queryByText('Hover me')).toBeNull();
  });
});
