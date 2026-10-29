import { applyAppearanceChoice } from '@texuli/astro/appearance';

export const THEME_STORAGE_KEY = 'protoyard.gallery.theme';
export const APPEARANCE_NAMESPACE = 'gallery';
export const THEME_ID = 'gallery';

/**
 * Runs before Texuli's no-flash bootstrap. Move the gallery's old mode choice
 * into Texuli's namespaced cache once, then remove the obsolete key.
 */
export const APPEARANCE_MIGRATION_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}',m=k+'.migrated',c=localStorage.getItem(k);if(localStorage.getItem(m)!=='1'){if(c==='light'||c==='dark'){var v={v:1,themeId:'${THEME_ID}',mode:c,vars:{}};localStorage.setItem('texuli.${APPEARANCE_NAMESPACE}.appearance',JSON.stringify(v));}localStorage.removeItem(k);localStorage.setItem(m,'1');}}catch(e){}})();`;

/**
 * Light or dark from the command palette: the same namespaced cache and root
 * mode as the header's `@texuli/astro` AppearanceSwitcher.
 */
export function applyThemeMode(mode: 'light' | 'dark'): void {
  applyAppearanceChoice(APPEARANCE_NAMESPACE, mode, { themeId: THEME_ID });
}
