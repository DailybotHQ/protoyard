import type { PrototypeRuntime } from '@protoyard/core';
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FullScreenExit from '../src/shell/FullScreenExit.svelte';
import { enterFullScreen, takeFullScreenHint } from '../src/shell/frame-mode.ts';

afterEach(cleanup);

function fakeRuntime() {
  return {
    manifest: { storage: { namespace: 'hint-test' } },
    overrides: { get: () => ({}) },
    theme: { setOverride: vi.fn(async () => {}) },
  } as unknown as PrototypeRuntime;
}

describe('full screen hint (Corag UG-46)', () => {
  it('is due only after enterFullScreen, once', async () => {
    // A `none` override written by adaptive presentation or DevTools: no hint.
    expect(takeFullScreenHint()).toBe(false);
    await enterFullScreen(fakeRuntime());
    expect(takeFullScreenHint()).toBe(true);
    expect(takeFullScreenHint()).toBe(false);
  });

  it('keeps the exit control without the hint', () => {
    const view = render(FullScreenExit, { props: { onexit: () => {}, hint: false } });
    expect(view.container.querySelector('[data-py-frame-toggle]')).not.toBeNull();
    expect(view.container.querySelector('[data-py-frame-hint]')).toBeNull();
  });

  it('shows the hint when asked', () => {
    const view = render(FullScreenExit, { props: { onexit: () => {}, hint: true } });
    expect(view.container.querySelector('[data-py-frame-hint]')).not.toBeNull();
  });
});
