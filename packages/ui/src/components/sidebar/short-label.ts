/**
 * The two-letter stand-in a collapsed sidebar item shows when it has no icon,
 * the same rule as Texuli's Sidebar: `shortLabel`, else the first two letters
 * or digits of the label, upper-cased.
 */
export function sidebarShortLabel(item: { label: string; shortLabel?: string }): string {
  if (item.shortLabel?.trim()) return item.shortLabel.trim().slice(0, 2);
  const letters = item.label.replace(/[^\p{L}\p{N}]/gu, '');
  return (letters.slice(0, 2) || item.label.slice(0, 2) || '?').toUpperCase();
}
