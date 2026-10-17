export type ThemeChoice = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'protoyard.gallery.theme';

/**
 * Inline in <head> before any CSS paints: reads the saved choice and sets
 * html[data-theme], so there is never a light flash on a dark system.
 */
export const NO_FLASH_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}';var c=localStorage.getItem(k);if(c!=='light'&&c!=='dark')c='system';var d=c==='dark'||(c==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.themeChoice=c;}catch(e){document.documentElement.dataset.theme=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}})();`;

export function readThemeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(choice: ThemeChoice) {
  const dark =
    choice === 'dark' ||
    (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.themeChoice = choice;
  try {
    if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
}
