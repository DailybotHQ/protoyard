import { cleanup, render, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { loadMotionRuntime } from 'texuli/motion';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enterToast,
  motionSettingsFor,
  TOAST_ENTER_MOTION,
} from '../src/components/toast/toast-motion.ts';
import UndoToaster from '../src/components/toast/UndoToaster.svelte';
import { undoToast } from '../src/components/toast/undo.svelte.ts';

/**
 * Toast motion is Texuli's (texuli/motion presence on the --tx-motion-*
 * tokens): it plays with motion on, and commits at once under the reader's
 * reduced motion, a MotionProvider override, or the prototype's own toggle.
 * jsdom has no Web Animations API, so `animate` is stubbed to record plays.
 */
const animate = vi.fn();
let reduce = false;

function fakeAnimation(): Animation {
  let resolve: (value: Animation) => void = () => {};
  const finished = new Promise<Animation>((r) => (resolve = r));
  const animation = {
    finished,
    playState: 'running',
    onfinish: null,
    oncancel: null,
    cancel: () => resolve(animation as unknown as Animation),
    finish: () => resolve(animation as unknown as Animation),
    addEventListener: () => {},
    removeEventListener: () => {},
    commitStyles: () => {},
    persist: () => {},
  };
  return animation as unknown as Animation;
}

beforeAll(async () => {
  await loadMotionRuntime();
});

beforeEach(() => {
  reduce = false;
  animate.mockReset();
  animate.mockImplementation(fakeAnimation);
  Object.defineProperty(Element.prototype, 'animate', { value: animate, configurable: true });
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion') && query.includes('reduce') && reduce,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList
  );
});

afterEach(() => {
  undoToast.dismiss();
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, 'animate');
  document.documentElement.removeAttribute('data-py-motion');
  document.body.replaceChildren();
});

const FULL = { level: 'full', reducedMotion: undefined } as const;

function toast(): HTMLElement {
  const node = document.createElement('li');
  document.body.append(node);
  return node;
}

describe('toast enter motion (texuli/motion)', () => {
  it('plays Texuli’s rise preset with motion on', () => {
    expect(TOAST_ENTER_MOTION).toEqual({ enter: 'rise', duration: 'base' });
    const hold = enterToast(toast(), FULL);
    expect(hold).not.toBeNull();
    expect(animate).toHaveBeenCalled();
  });

  it('commits at once under the reader’s reduced motion', () => {
    reduce = true;
    expect(enterToast(toast(), FULL)).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it('commits at once under the prototype’s reduced-motion toggle', () => {
    document.documentElement.setAttribute('data-py-motion', 'reduce');
    const node = toast();
    expect(motionSettingsFor(node, FULL).reducedMotion).toBe(true);
    expect(enterToast(node, FULL)).toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it('lets a MotionProvider override win over the toggle and the reader', () => {
    document.documentElement.setAttribute('data-py-motion', 'reduce');
    expect(motionSettingsFor(toast(), { level: 'full', reducedMotion: false }).reducedMotion).toBe(
      false
    );
    expect(enterToast(toast(), { level: 'none', reducedMotion: undefined })).toBeNull();
  });

  it('animates a new undo toast in the UndoToaster, and not under reduced motion', async () => {
    render(UndoToaster);
    undoToast.show({ message: 'Deleted 1 task', onUndo: () => {} });
    flushSync();
    await waitFor(() => expect(document.querySelector('[data-undo-id]')).not.toBeNull());
    expect(animate).toHaveBeenCalledTimes(1);

    undoToast.dismiss();
    flushSync();
    document.documentElement.setAttribute('data-py-motion', 'reduce');
    undoToast.show({ message: 'Deleted 2 tasks', onUndo: () => {} });
    flushSync();
    await waitFor(() => expect(document.querySelector('[data-undo-id]')).not.toBeNull());
    expect(animate).toHaveBeenCalledTimes(1);
  });
});
