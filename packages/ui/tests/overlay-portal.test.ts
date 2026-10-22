import { describe, expect, it, vi } from 'vitest';
import {
  getOverlayPortalTarget,
  setOverlayPortalTarget,
  subscribeOverlayPortalTarget,
} from '../src/lib/overlay-portal.ts';

describe('overlay portal target', () => {
  it('clears and notifies when the stored target is detached', () => {
    const target = document.createElement('div');
    document.body.append(target);
    const listener = vi.fn();
    const unsubscribe = subscribeOverlayPortalTarget(listener);

    try {
      setOverlayPortalTarget(target);
      expect(getOverlayPortalTarget()).toBe(target);
      listener.mockClear();

      target.remove();
      expect(getOverlayPortalTarget()).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(getOverlayPortalTarget()).toBeNull();
    } finally {
      unsubscribe();
    }
  });

  it('returns a connected portal target until it is cleared', () => {
    setOverlayPortalTarget(document.body);
    expect(getOverlayPortalTarget()).toBe(document.body);

    setOverlayPortalTarget(null);
    expect(getOverlayPortalTarget()).toBeNull();
  });
});
