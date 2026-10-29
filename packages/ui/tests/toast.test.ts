import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_TOASTS, Toaster, toast } from '../src/index.ts';

afterEach(() => {
  cleanup();
  toast.dismiss();
});

// The toast API and Toaster are Texuli's (`texuli/toast`); these pin what
// Protoyard's callers rely on through `@protoyard/ui`.
describe('toast (Texuli toast store)', () => {
  it('pushes typed toasts with descriptions and returns ids', () => {
    const id = toast.success('Saved', { description: 'All changes stored.' });
    toast.error('Failed');
    const items = toast.items;
    expect(items.map((item) => item.kind).sort()).toEqual(['error', 'success']);
    expect(items.find((item) => item.id === id)?.description).toBe('All changes stored.');
  });

  it('replaces a toast that reuses an id, dismisses by id and caps the stack', () => {
    toast.info('Saving…', { id: 'save' });
    toast.success('Saved', { id: 'save' });
    expect(toast.items.filter((item) => item.id === 'save').map((item) => item.title)).toEqual([
      'Saved',
    ]);
    toast.dismiss('save');
    expect(toast.items).toHaveLength(0);
    for (let index = 0; index < MAX_TOASTS + 2; index += 1) toast.info(`Note ${index}`);
    expect(toast.items.length).toBeLessThanOrEqual(MAX_TOASTS);
  });

  it('lets a host hold the timers (pause and resume) and reports why a toast settled', () => {
    vi.useFakeTimers();
    try {
      const onSettle = vi.fn();
      const id = toast.info('Synced', { duration: 1_000, onSettle });
      expect(toast.items.find((item) => item.id === id)?.announcement.message).toBe('Synced');
      toast.pause('host-test');
      vi.advanceTimersByTime(5_000);
      expect(toast.items.some((item) => item.id === id)).toBe(true);
      toast.resume('host-test');
      vi.advanceTimersByTime(1_000);
      expect(toast.items.some((item) => item.id === id)).toBe(false);
      expect(onSettle).toHaveBeenCalledWith('timeout');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Toaster (Texuli)', () => {
  it('renders toasts in a labelled region and closes one with its dismiss button', async () => {
    render(Toaster);
    toast.success('Saved');
    flushSync();
    expect(await screen.findByText('Saved')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification: Saved' }));
    await waitFor(() => expect(toast.items).toHaveLength(0));
  });

  it('turns `offset` into --tx-toast-offset', () => {
    const { container } = render(Toaster, { offset: 64 });
    const toaster = container.querySelector<HTMLElement>('[data-tx-toaster]');
    expect(toaster?.style.getPropertyValue('--tx-toast-offset')).toBe('64px');
  });
});

describe('Toaster right edge', () => {
  it("pads Texuli's viewport by the renderer's --py-fixed-right-edge", () => {
    const styles = readFileSync(join(process.cwd(), 'packages/ui/src/styles.css'), 'utf8');
    expect(styles).toMatch(
      /\[data-tx-toaster\] \.tx-toaster__viewport \{[^}]*var\(--py-fixed-right-edge, 0px\)/
    );
  });
});
