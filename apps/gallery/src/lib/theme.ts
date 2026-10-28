import { cacheAppearance, readCachedAppearance } from '@texuli/tokens/no-flash';

export type ThemeChoice = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'protoyard.gallery.theme';
export const APPEARANCE_NAMESPACE = 'gallery';
const THEME_ID = 'gallery';

/**
 * Runs before Texuli's no-flash bootstrap. Move the gallery's old mode choice
 * into Texuli's namespaced cache once, then remove the obsolete key.
 */
export const APPEARANCE_MIGRATION_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}',m=k+'.migrated',c=localStorage.getItem(k);if(localStorage.getItem(m)!=='1'){if(c==='light'||c==='dark'){var v={v:1,themeId:'${THEME_ID}',mode:c,vars:{}};localStorage.setItem('texuli.${APPEARANCE_NAMESPACE}.appearance',JSON.stringify(v));}localStorage.removeItem(k);localStorage.setItem(m,'1');}}catch(e){}})();`;

function resolvedMode(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function readThemeChoice(): ThemeChoice {
  const cached = readCachedAppearance(APPEARANCE_NAMESPACE);
  if (cached?.mode === 'light' || cached?.mode === 'dark') return cached.mode;
  return 'system';
}

export function applyTheme(choice: ThemeChoice): void {
  const mode = resolvedMode(choice);
  document.documentElement.dataset.txMode = mode;
  cacheAppearance(APPEARANCE_NAMESPACE, { themeId: THEME_ID, mode, vars: {} });
}
