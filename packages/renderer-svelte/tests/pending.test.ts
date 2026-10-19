import { cleanup, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPrototype, runService } from '../src/index.ts';
import PendingIndicator from '../src/shell/PendingIndicator.svelte';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';
import ProbeApp from './fixtures/ProbeApp.svelte';

const bar = () => document.querySelector('[data-py-pending-bar]');
const status = () => document.querySelector('[data-py-pending-status]')?.textContent ?? '';

describe('global pending indicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('appears only after the delay, then clears when the work settles', () => {
    const runtime = createFakeRuntime();
    render(PendingIndicator, { runtime });
    const end = runtime.pending?.begin({ kind: 'service', label: 'notes.create' });
    flushSync();
    expect(bar()).toBeNull();
    vi.advanceTimersByTime(149);
    flushSync();
    expect(bar()).toBeNull();
    vi.advanceTimersByTime(1);
    flushSync();
    expect(bar()).not.toBeNull();
    expect(bar()?.getAttribute('role')).toBe('progressbar');
    end?.();
    flushSync();
    expect(bar()).toBeNull();
  });

  it('never shows for instant work', () => {
    const runtime = createFakeRuntime();
    render(PendingIndicator, { runtime });
    const end = runtime.pending?.begin({ label: 'instant' });
    flushSync();
    vi.advanceTimersByTime(40);
    end?.();
    flushSync();
    vi.advanceTimersByTime(500);
    flushSync();
    expect(bar()).toBeNull();
  });

  it('announces long work once, politely, in words', () => {
    const runtime = createFakeRuntime();
    render(PendingIndicator, { runtime });
    const end = runtime.pending?.begin({ kind: 'service', label: 'notes.create' });
    flushSync();
    vi.advanceTimersByTime(999);
    flushSync();
    expect(status()).toBe('');
    vi.advanceTimersByTime(1);
    flushSync();
    expect(status()).toBe('Working…');
    expect(document.querySelector('[data-py-pending-status]')?.getAttribute('aria-live')).toBe(
      'polite'
    );
    end?.();
    flushSync();
    expect(status()).toBe('');
    const persona = runtime.pending?.begin({ kind: 'session', label: 'Switching persona…' });
    flushSync();
    vi.advanceTimersByTime(1000);
    flushSync();
    expect(status()).toBe('Switching persona…');
    persona?.();
  });
});

describe('mountPrototype pending state', () => {
  let destroy: (() => Promise<void>) | undefined;
  afterEach(async () => {
    vi.useRealTimers();
    await destroy?.();
    destroy = undefined;
    document.body.replaceChildren();
  });

  async function boot(sleep?: (ms: number) => Promise<void>) {
    const target = document.body.appendChild(document.createElement('div'));
    const runtime = createFakeRuntime(sleep ? { sleep } : {});
    const mounted = await mountPrototype({
      definition: runtime.definition,
      App: ProbeApp,
      target,
      search: '',
      devtools: false,
      createRuntime: () => runtime,
    });
    destroy = mounted.destroy;
    return { runtime, target };
  }

  it('marks the app root aria-busy while a service runs, and shows the bar inside the screen', async () => {
    let release!: () => void;
    const { runtime, target } = await boot((ms) =>
      ms > 0 ? new Promise<void>((r) => (release = r)) : Promise.resolve()
    );
    const scrollRoot = target.querySelector('[data-py-scroll-root]');
    expect(scrollRoot?.hasAttribute('aria-busy')).toBe(false);
    vi.useFakeTimers();
    runtime.environment.set({ latencyMs: 800 });
    const call = runtime.environment.run('notes.create', () => 'ok');
    flushSync();
    expect(scrollRoot?.getAttribute('aria-busy')).toBe('true');
    vi.advanceTimersByTime(200);
    flushSync();
    const shownBar = bar();
    expect(shownBar).not.toBeNull();
    // Rendered inside the shell's screen (top of the app), never in the page flow above it.
    expect(target.querySelector('[data-py-shell-part="screen"]')?.contains(shownBar)).toBe(true);
    vi.useRealTimers();
    release();
    await call;
    flushSync();
    expect(scrollRoot?.hasAttribute('aria-busy')).toBe(false);
    expect(bar()).toBeNull();
  });

  it('runService counts as pending in the mounted runtime, and errors still resolve', async () => {
    const { runtime } = await boot();
    let finish!: () => void;
    const result = runService(() => new Promise<void>((r) => (finish = r)));
    expect(runtime.pending?.count()).toBe(1);
    finish();
    await expect(result).resolves.toEqual({ ok: true, value: undefined });
    expect(runtime.pending?.count()).toBe(0);
    const failed = await runService(() => Promise.reject(new Error('nope')));
    expect(failed.ok).toBe(false);
    expect(runtime.pending?.count()).toBe(0);
  });
});
