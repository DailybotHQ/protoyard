import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '../src/components/toast/toast.svelte.ts';
import UndoToaster from '../src/components/toast/UndoToaster.svelte';
import { undoToast } from '../src/components/toast/undo.svelte.ts';

beforeEach(() => {
  vi.useFakeTimers();
  toast.dismiss();
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  undoToast.dismiss();
  vi.useRealTimers();
});

const classes = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/);

describe('UndoToaster gaps and right edge', () => {
  it('lets taps through the gaps and stays inside the visible right edge on phones', async () => {
    render(UndoToaster);
    undoToast.show({ message: 'Archived', onUndo: () => {} });
    undoToast.show({ message: 'Moved', onUndo: () => {} });
    flushSync();
    const region = screen.getByRole('region', { name: 'Undo notifications' });
    const list = region.querySelector('ol');
    const items = [...(list?.querySelectorAll(':scope > li') ?? [])];
    expect(classes(region)).toContain('pointer-events-none');
    expect(classes(region)).toContain('pr-[calc(1rem+var(--py-fixed-right-edge,0px))]');
    expect(classes(list)).toContain('pointer-events-none');
    expect(items).toHaveLength(2);
    for (const item of items) expect(classes(item)).toContain('pointer-events-auto');
    // Hovering a toast still pauses its countdown.
    await fireEvent.mouseEnter(list as Element);
    vi.advanceTimersByTime(60_000);
    flushSync();
    expect(screen.getAllByRole('button', { name: /Undo/ }).length).toBeGreaterThan(0);
  });
});
