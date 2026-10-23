/**
 * The catalog's 64 theme ids, for code on the boot path that only checks an
 * id (blueprint brand validation). Reading them from `THEME_LIBRARY_META`
 * would put Texuli's whole port records module (about 23 KB) in every
 * player page's first-load chunk. `tests/library.test.ts` keeps this list
 * equal, in order, to `@texuli/tokens/library`'s catalog.
 */
export const LIBRARY_THEME_IDS: readonly string[] = Object.freeze([
  'fintech-ledger',
  'health-clinic',
  'devtools-night',
  'enterprise-neutral',
  'editorial-luxury',
  'playful-consumer',
  'kids-playground',
  'education-campus',
  'gaming-neon',
  'legal-serif',
  'ecommerce-bold',
  'marketplace-fair',
  'travel-horizon',
  'food-bistro',
  'real-estate-loft',
  'hr-people',
  'analytics-insight',
  'security-vault',
  'ai-lab',
  'productivity-minimal',
  'brutalist-block',
  'retro-terminal',
  'glass-frost',
  'accessible-high-contrast',
  'accessible-dark-contrast',
  'saas-startup',
  'media-studio',
  'nonprofit-hope',
  'iot-control',
  'sports-arena',
  'climate-earth',
  'crypto-ledger',
  'harbor-teal',
  'midnight-ops',
  'paper-ledger',
  'citrus-market',
  'aurora-analytics',
  'clinic-calm',
  'campus-ivy',
  'studio-reel',
  'transit-line',
  'hearth-home',
  'civic-hall',
  'nimbus-cloud',
  'ember-pay',
  'lumen-notes',
  'orbit-chat',
  'quartz-people',
  'summit-crm',
  'pixel-forge',
  'velvet-shop',
  'contrast-paper',
  'contrast-ink',
  'contrast-night',
  'contrast-amber',
  'okabe-blue',
  'okabe-orange',
  'safe-signal',
  'clear-sight',
  'winter-frost',
  'autumn-harvest',
  'sepia-print',
  'fieldwork',
  'graphite',
]);

const ids = new Set(LIBRARY_THEME_IDS);

/** Whether `id` names a catalog theme (not a built-in, not the opt-in expanded set). */
export function isLibraryThemeId(id: string): boolean {
  return ids.has(id);
}
