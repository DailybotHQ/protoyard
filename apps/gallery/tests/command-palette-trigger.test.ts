import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { retryable } from '../src/lib/retryable.ts';

afterEach(() => cleanup());

describe('retryable lazy loader', () => {
  it('shares one in-flight load and caches success', async () => {
    const load = vi.fn(async () => 'palette');
    const get = retryable(load);
    const [a, b] = await Promise.all([get(), get()]);
    expect([a, b]).toEqual(['palette', 'palette']);
    await get();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed load so the next call retries', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValue('palette');
    const get = retryable(load);
    await expect(get()).rejects.toThrow('chunk failed');
    await expect(get()).resolves.toBe('palette');
    expect(load).toHaveBeenCalledTimes(2);
  });
});

const palette = vi.hoisted(() => ({ failNext: true, shown: 0 }));

vi.mock('../src/components/CommandPalette.svelte', async () => {
  if (palette.failNext) {
    palette.failNext = false;
    throw new Error('Failed to fetch dynamically imported module');
  }
  return import('./fixtures/PaletteStub.svelte');
});

describe('CommandPaletteTrigger', () => {
  it('reports a failed palette chunk and loads it on the next open', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: Trigger } = await import('../src/components/CommandPaletteTrigger.svelte');
    render(Trigger, { homeUrl: '/' });
    const button = screen.getByRole('button', { name: /^Search/ });

    await fireEvent.click(button);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Search could not load/);
    expect(error).toHaveBeenCalled();

    await fireEvent.click(button);
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    const stub = await screen.findByTestId('palette-stub');
    await vi.waitFor(() => expect(stub.getAttribute('data-open')).toBe('true'));
    error.mockRestore();
  });
});
