import type { AppliedAppearance } from './apply.ts';

/**
 * Prevents a light/dark flash before the runtime boots: the renderer caches
 * the last applied appearance per prototype and an inline `<head>` script
 * replays it before first paint. Storage may be unavailable (private mode,
 * sandboxed iframes), so every access is guarded.
 */

export const APPEARANCE_CACHE_VERSION = 1;

export function appearanceCacheKey(namespace: string): string {
  return `protoyard.${namespace}.appearance`;
}

export interface CachedAppearance extends AppliedAppearance {
  v: typeof APPEARANCE_CACHE_VERSION;
}

/**
 * `localStorage`, or `undefined` where reading it throws (blocked site data,
 * some private windows, sandboxed frames). Use it as the default storage
 * argument: a plain `= globalThis.localStorage` default would throw before
 * any `try` runs.
 */
export function localStorageOrUndefined(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function cacheAppearance(
  namespace: string,
  applied: AppliedAppearance,
  storage: Pick<Storage, 'setItem'> | undefined = localStorageOrUndefined()
): boolean {
  try {
    if (!storage) return false;
    const payload: CachedAppearance = { v: APPEARANCE_CACHE_VERSION, ...applied };
    storage.setItem(appearanceCacheKey(namespace), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function readCachedAppearance(
  namespace: string,
  storage: Pick<Storage, 'getItem'> | undefined = localStorageOrUndefined()
): CachedAppearance | null {
  try {
    const raw = storage?.getItem(appearanceCacheKey(namespace));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedAppearance>;
    if (parsed.v !== APPEARANCE_CACHE_VERSION || typeof parsed.vars !== 'object') return null;
    return parsed as CachedAppearance;
  } catch {
    return null;
  }
}

/**
 * The inline script body (no `<script>` tag). Only `--py-*` and `--tx-*`
 * names and string values are replayed, so a tampered cache cannot inject
 * markup.
 * Without a cache it still honors `prefers-color-scheme` for the base CSS.
 */
export function noFlashScript(namespace: string): string {
  const key = JSON.stringify(appearanceCacheKey(namespace));
  // Replays --py-* and --tx-* vars, mode class, theme id, motion, data-py-surface
  // (glass/solid) and allowlisted component profiles so first paint matches
  // the last applied appearance. The data-tx-* twins are what Texuli components read.
  return `(function(){var d=document.documentElement;try{var c=JSON.parse(localStorage.getItem(${key})||'null');if(c&&c.v===${APPEARANCE_CACHE_VERSION}&&c.vars){for(var k in c.vars){if(/^--(?:py|tx)-[a-z0-9-]+$/.test(k)&&typeof c.vars[k]==='string')d.style.setProperty(k,c.vars[k]);}var m=c.mode==='dark'?'dark':'light';d.classList.add(m);d.dataset.pyMode=m;d.dataset.txMode=m;d.style.colorScheme=m;if(typeof c.themeId==='string'){d.dataset.pyTheme=c.themeId;d.dataset.txTheme=c.themeId;}d.dataset.pyMotion=c.reducedMotion?'reduce':'full';d.dataset.txMotion=d.dataset.pyMotion;var s=typeof c.surface==='string'?c.surface:(c.vars&&c.vars['--py-surface-style']);if(s==='glass'||s==='solid'){d.dataset.pySurface=s;d.dataset.txSurface=s;}var p=c.components||{};if(p.button==='pill'||p.button==='square')d.dataset.pyButtonStyle=p.button;if(p.card==='glass'||p.card==='bordered')d.dataset.pyCardStyle=p.card;if(/^(ring|outline|glow|inset)$/.test(p.focusRing))d.dataset.pyFocusRingStyle=p.focusRing;return;}}catch(e){}try{if(matchMedia('(prefers-color-scheme: dark)').matches){d.classList.add('dark');d.dataset.pyMode='dark';d.dataset.txMode='dark';d.style.colorScheme='dark';}}catch(e){}})();`;
}
