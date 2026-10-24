import { getOverlayPortalTarget, subscribeOverlayPortalTarget } from './overlay-portal.ts';

/**
 * Where overlays open: inside the framed device screen when a shell sets one
 * (`contained`, bounded by that screen), else in the page's top layer.
 */
export function useOverlayPortalTarget(): {
  readonly current: Element | undefined;
  readonly mode: 'top-layer' | 'contained';
  readonly container: Element | null;
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
    get mode() {
      return current ? 'contained' : 'top-layer';
    },
    get container() {
      return current ?? null;
    },
  };
}
