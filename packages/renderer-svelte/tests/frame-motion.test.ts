import { getDevice } from '@protoyard/core';
import { cleanup, render } from '@testing-library/svelte';
import { loadMotionRuntime } from 'texuli/motion';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FRAME_ENTER_MOTION, frameMotionSettings } from '../src/shell/frames/frame-motion.ts';
import PhoneFrame from '../src/shell/frames/PhoneFrame.svelte';
import TabletFrame from '../src/shell/frames/TabletFrame.svelte';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';

/**
 * The phone and tablet bezels pop in with Texuli motion (texuli/motion
 * presence, `scale` on the `fast` token) instead of a local keyframe, and
 * commit at once under reduced motion. jsdom has no Web Animations API, so
 * `animate` is stubbed to record plays.
 */
const runtimeMock = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../src/context.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/context.ts')>();
  return { ...actual, getRuntime: () => runtimeMock.current ?? actual.getRuntime() };
});

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
  runtimeMock.current = createFakeRuntime();
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
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, 'animate');
  document.documentElement.removeAttribute('data-py-motion');
  runtimeMock.current = null;
});

const phone = getDevice('phone-pill');
const tablet = getDevice('tablet');

describe('frame bezel motion (texuli/motion)', () => {
  it('pops the phone and tablet bezels in with Texuli’s scale preset', () => {
    if (!phone || !tablet) throw new Error('catalog devices missing');
    expect(FRAME_ENTER_MOTION).toEqual({ enter: 'scale', duration: 'fast' });
    for (const [Frame, spec, shell] of [
      [PhoneFrame, phone, 'phone'],
      [TabletFrame, tablet, 'tablet'],
    ] as const) {
      animate.mockClear();
      const { container } = render(Frame, { spec, shell });
      const bezel = container.querySelector('[data-py-frame-decoration]');
      expect(animate.mock.contexts, shell).toContain(bezel);
      cleanup();
    }
  });

  it('commits at once under the reader’s reduced motion or the prototype’s toggle', () => {
    if (!phone) throw new Error('catalog device missing');
    reduce = true;
    render(PhoneFrame, { spec: phone, shell: 'phone' });
    expect(animate).not.toHaveBeenCalled();
    cleanup();

    reduce = false;
    document.documentElement.setAttribute('data-py-motion', 'reduce');
    render(PhoneFrame, { spec: phone, shell: 'phone' });
    expect(animate).not.toHaveBeenCalled();
    expect(
      frameMotionSettings(document.body, { level: 'full', reducedMotion: undefined }).reducedMotion
    ).toBe(true);
  });
});
