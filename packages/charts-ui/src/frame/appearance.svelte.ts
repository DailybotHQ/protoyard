import {
  type ChartPalette,
  chartPalette,
  chartPaletteVariables,
  type ResolvedMode,
  readChartPaletteInput,
} from '@protoyard/charts/palette';

/*
 * One appearance reader shared by every chart on the page: it reads the
 * theme's resolved CSS variables from <html> once per appearance change
 * (theme, mode, reduced motion) instead of once per chart, and derives the
 * validated chart palette from them. A MutationObserver on <html> notices
 * the renderer's applyAppearance() writes (data-py-* attributes and inline
 * custom properties).
 */

export interface ChartAppearance {
  readonly mode: ResolvedMode;
  readonly reducedMotion: boolean;
  /** Validated palette, or null when the theme variables are not hex (charts then use the raw tokens). */
  readonly palette: ChartPalette | null;
  /** Custom properties for a chart root (`--py-chart1…8`, `--py-seq-*`, `--py-div-*`); empty without a palette. */
  readonly variables: Readonly<Record<string, string>>;
}

const OBSERVED = ['data-py-theme', 'data-py-mode', 'data-py-motion', 'class', 'style'];

const state = $state<{ current: ChartAppearance }>({
  current: { mode: 'light', reducedMotion: false, palette: null, variables: {} },
});

let subscribers = 0;
let observer: MutationObserver | null = null;
let motionQuery: MediaQueryList | null = null;
let lastKey = '';

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function read(): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  const mode: ResolvedMode =
    html.dataset.pyMode === 'dark' ||
    (html.dataset.pyMode !== 'light' && html.classList.contains('dark'))
      ? 'dark'
      : 'light';
  const reducedMotion = html.dataset.pyMotion === 'reduce' || prefersReducedMotion();
  const style = getComputedStyle(html);
  const input = readChartPaletteInput((token) => style.getPropertyValue(`--py-${token}`));
  // Only rebuild when something the palette depends on changed.
  const key = `${mode}|${reducedMotion}|${Object.values(input).join(',')}`;
  if (key === lastKey) return;
  lastKey = key;
  let palette: ChartPalette | null = null;
  try {
    palette = chartPalette(input, mode);
  } catch {
    palette = null;
  }
  state.current = {
    mode,
    reducedMotion,
    palette,
    variables: palette ? chartPaletteVariables(palette) : {},
  };
}

/** Starts watching (first subscriber) and returns a release function. */
export function acquireChartAppearance(): () => void {
  subscribers++;
  if (subscribers === 1 && typeof document !== 'undefined') {
    read();
    if (typeof MutationObserver === 'function') {
      observer = new MutationObserver(read);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: OBSERVED });
    }
    if (typeof matchMedia === 'function') {
      motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
      motionQuery.addEventListener?.('change', read);
    }
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    subscribers--;
    if (subscribers === 0) {
      observer?.disconnect();
      observer = null;
      motionQuery?.removeEventListener?.('change', read);
      motionQuery = null;
      lastKey = '';
    }
  };
}

/** The current appearance; reactive inside components and $derived. */
export function chartAppearance(): ChartAppearance {
  return state.current;
}

/** Re-reads the theme variables now (for code that changes them without touching <html> attributes). */
export function refreshChartAppearance(): void {
  lastKey = '';
  read();
}
