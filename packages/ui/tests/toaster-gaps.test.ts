import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Toaster from '../src/components/toast/Toaster.svelte';
import { toast } from '../src/components/toast/toast.svelte.ts';

beforeEach(() => {
  vi.useFakeTimers();
  toast.dismiss();
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.useRealTimers();
});

const classes = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/);

function showTwo() {
  render(Toaster);
  toast.success('Saved');
  toast.info('Synced', { description: 'Two devices updated.' });
  flushSync();
  const region = screen.getByRole('region', { name: 'Notifications' });
  const list = region.querySelector('ol');
  const items = [...(list?.querySelectorAll(':scope > li') ?? [])];
  return { region, list, items };
}

describe('Toaster gaps', () => {
  it('lets taps through the region, the list and the gaps; only toasts take pointer events', () => {
    const { region, list, items } = showTwo();
    expect(classes(region)).toContain('pointer-events-none');
    expect(classes(list)).toContain('pointer-events-none');
    expect(classes(list)).not.toContain('pointer-events-auto');
    // The 0.5rem gap between toasts belongs to the list, which is transparent.
    expect(classes(list)).toContain('gap-2');
    for (const item of items) expect(classes(item)).toContain('pointer-events-auto');
  });

  it('keeps every toast control usable', async () => {
    const onClick = vi.fn();
    render(Toaster);
    toast.info('Archived', { action: { label: 'Undo', onClick } });
    flushSync();
    await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledOnce();
    toast.success('Saved');
    flushSync();
    await fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification: Saved' }));
    expect(screen.queryByRole('button', { name: 'Dismiss notification: Saved' })).toBeNull();
  });

  it('still pauses auto-dismiss while the pointer is over a toast', async () => {
    const { list } = showTwo();
    // The pointer entering a toast fires mouseenter on the (transparent) list too.
    await fireEvent.mouseEnter(list as Element);
    vi.advanceTimersByTime(60_000);
    flushSync();
    const saved = () => screen.queryByRole('button', { name: 'Dismiss notification: Saved' });
    expect(saved()).toBeTruthy();
    await fireEvent.mouseLeave(list as Element);
    vi.advanceTimersByTime(60_000);
    flushSync();
    expect(saved()).toBeNull();
  });
});

describe('Toaster offset', () => {
  it('reads --py-toast-offset (default 0) for the bottom padding at every width', () => {
    render(Toaster);
    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(classes(region)).toContain(
      'pb-[calc(max(1rem,env(safe-area-inset-bottom))+var(--py-toast-offset,0px))]'
    );
    expect(classes(region)).toContain('sm:pb-[calc(1.5rem+var(--py-toast-offset,0px))]');
    // Without `offset` the variable is inherited from the page, not overridden.
    expect(region.style.getPropertyValue('--py-toast-offset')).toBe('');
  });

  it('sets --py-toast-offset from a px number or a CSS length', () => {
    render(Toaster, { offset: 72 });
    expect(
      screen
        .getByRole('region', { name: 'Notifications' })
        .style.getPropertyValue('--py-toast-offset')
    ).toBe('72px');
    cleanup();
    render(Toaster, { offset: 'calc(4rem + 8px)' });
    expect(
      screen
        .getByRole('region', { name: 'Notifications' })
        .style.getPropertyValue('--py-toast-offset')
    ).toBe('calc(4rem + 8px)');
  });

  it('stays inside the visible right edge the renderer publishes', () => {
    render(Toaster);
    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(classes(region)).toContain('right-[var(--py-fixed-right-edge,0px)]');
    expect(classes(region)).toContain('sm:left-auto');
  });
});
