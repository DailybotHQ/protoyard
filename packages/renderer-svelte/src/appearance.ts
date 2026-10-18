import type { PrototypeRuntime, Theme } from '@protoyard/core';
import {
  type AppliedAppearance,
  applyAppearance,
  cacheAppearance,
  getTheme,
} from '@protoyard/themes';

/**
 * Keeps the document in sync with the runtime's effective appearance and
 * caches it for the no-flash boot script. Returns an unsubscribe function.
 */
export function bindAppearance(
  runtime: PrototypeRuntime,
  themes: readonly Theme[],
  target: HTMLElement = document.documentElement
): () => void {
  const namespace = runtime.manifest.storage.namespace;
  const apply = (): AppliedAppearance => {
    const state = runtime.theme.appearance();
    // The runtime's list also holds Theme Studio custom themes saved after mount.
    const known = runtime.theme.themes();
    const applied = applyAppearance(target, {
      theme: getTheme(state.theme.value, known.length ? known : themes),
      resolvedMode: state.resolvedMode,
      reducedMotion: state.reducedMotion.value,
      // Older runtimes (before the density override) fall back to the theme's own density.
      ...(state.density ? { density: state.density.value } : {}),
    });
    const viewport = state.viewport.value;
    if (viewport === 'desktop' || viewport === 'custom') delete target.dataset.pyViewport;
    else target.dataset.pyViewport = viewport;
    cacheAppearance(namespace, applied);
    return applied;
  };
  apply();
  return runtime.theme.subscribe(() => {
    apply();
  });
}
