import {
  getOverlayPortalTarget,
  subscribeOverlayPortalTarget,
} from './overlay-portal.ts';

/**
 * Reactive portal `to` for Bits UI: the framed device screen when set, else
 * `undefined` (Bits defaults to `document.body`).
 */
export function useOverlayPortalTarget(): {
  readonly current: Element | undefined;
} {
  let current = $state.raw<Element | undefined>(getOverlayPortalTarget() ?? undefined);
  $effect(() => {
    let alive = true;
    const sync = () => {
      if (!alive) return;
      current = getOverlayPortalTarget() ?? undefined;
    };
    sync();
    const stop = subscribeOverlayPortalTarget(sync);
    return () => {
      alive = false;
      stop();
    };
  });
  return {
    get current() {
      return current;
    },
  };
}
