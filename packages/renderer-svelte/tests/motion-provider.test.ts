import { flushSync } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { mountPrototype } from '../src/index.ts';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';
import ProbeApp from './fixtures/ProbeApp.svelte';

/**
 * The renderer wraps every prototype in a texuli/motion MotionProvider. The
 * prototype's resolved reduced-motion setting forces Texuli's reduced motion
 * (every enter, exit and layout change commits at once); without it Texuli
 * follows the reader's own preference.
 */
describe('the prototype’s reduced-motion setting reaches texuli/motion', () => {
  let destroy: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await destroy?.();
    destroy = undefined;
    document.body.replaceChildren();
  });

  it('forces reduced motion while the setting is on, and follows the reader otherwise', async () => {
    const target = document.body.appendChild(document.createElement('div'));
    const runtime = createFakeRuntime();
    const mounted = await mountPrototype({
      definition: runtime.definition,
      App: ProbeApp,
      target,
      search: '',
      devtools: false,
      createRuntime: () => runtime,
    });
    destroy = mounted.destroy;
    const probe = () => target.querySelector('[data-testid="reduced-motion"]')?.textContent;
    // `undefined`: no override, Texuli reads prefers-reduced-motion itself.
    expect(probe()).toBe('undefined');
    await runtime.overrides.set({ reducedMotion: true });
    flushSync();
    expect(probe()).toBe('true');
    await runtime.overrides.set({ reducedMotion: false });
    flushSync();
    expect(probe()).toBe('undefined');
  });
});
