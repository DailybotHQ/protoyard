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
    const applied = applyAppearance(target, {
      theme: getTheme(state.theme.value, themes),
      resolvedMode: state.resolvedMode,
      reducedMotion: state.reducedMotion.value,
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
