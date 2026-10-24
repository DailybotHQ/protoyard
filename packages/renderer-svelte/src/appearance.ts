import {
  type AppearanceState,
  type PrototypeRuntime,
  STYLE_OVERRIDE_KEYS,
  type Theme,
} from '@protoyard/core';
import { applyAppearance, cacheAppearance, getTheme } from '@protoyard/themes';
import { enableTexuliAppearance } from '@protoyard/themes/texuli';

type StylePresets = typeof import('./style-presets.ts');
type StyleSelection = Parameters<StylePresets['styledTheme']>[1];

/** The live style presets (override › scenario); `null` dimensions keep the theme's own value. */
function styleSelection(state: AppearanceState): StyleSelection | null {
  const selection: Record<string, string> = {};
  for (const key of STYLE_OVERRIDE_KEYS) {
    const value = state[key]?.value;
    if (value) selection[key] = value;
  }
  return Object.keys(selection).length ? (selection as StyleSelection) : null;
}

/**
 * Keeps the document in sync with the runtime's effective appearance and
 * caches it for the no-flash boot script. Returns an unsubscribe function.
 *
 * Style presets load lazily on first use. Until they arrive the document
 * keeps what it shows (the no-flash replay at boot), so a stored override
 * never flashes the plain theme first.
 */
export function bindAppearance(
  runtime: PrototypeRuntime,
  themes: readonly Theme[],
  target: HTMLElement = document.documentElement
): () => void {
  const namespace = runtime.manifest.storage.namespace;
  let presets: StylePresets | null | undefined;
  let loading = false;
  let stopped = false;

  const apply = (): void => {
    const state = runtime.theme.appearance();
    // The runtime's list also holds Theme Studio custom themes saved after mount.
    const known = runtime.theme.themes();
    let theme = getTheme(state.theme.value, known.length ? known : themes);
    const style = styleSelection(state);
    if (style && presets === undefined) {
      // One load; it re-applies the latest state once the presets arrive.
      if (!loading) {
        loading = true;
        import('./style-presets.ts')
          .then(
            (module) => {
              presets = module;
            },
            (error: unknown) => {
              // Offline without the chunk: keep the theme's own style rather than nothing.
              console.error('[protoyard/renderer]', error);
              presets = null;
            }
          )
          .then(() => {
            if (!stopped) apply();
          });
      }
      return;
    }
    if (style && presets) {
      try {
        theme = presets.styledTheme(theme, style);
      } catch (error) {
        // A theme the presets cannot extend keeps its own style.
        console.error('[protoyard/renderer]', error);
      }
    }
    const applied = applyAppearance(target, {
      theme,
      resolvedMode: state.resolvedMode,
      reducedMotion: state.reducedMotion.value,
      // Older runtimes (before the density override) fall back to the theme's own density.
      ...(state.density ? { density: state.density.value } : {}),
    });
    const viewport = state.viewport.value;
    if (viewport === 'desktop' || viewport === 'custom') delete target.dataset.pyViewport;
    else target.dataset.pyViewport = viewport;
    cacheAppearance(namespace, applied);
  };
  // @protoyard/ui renders Texuli components: every appearance also writes their
  // --tx-* variables (each --py-* name stays an alias with the same value).
  enableTexuliAppearance([target]);
  apply();
  const unsubscribe = runtime.theme.subscribe(() => {
    apply();
  });
  return () => {
    stopped = true;
    unsubscribe();
  };
}
