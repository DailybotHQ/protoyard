/** UI-only platform hints: whether `mod` means ⌘ and how to print a shortcut. */

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const hinted = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
    ?.platform;
  return /mac|iphone|ipad|ipod/i.test(hinted ?? navigator.platform ?? navigator.userAgent ?? '');
}

const MAC_KEYS: Record<string, string> = { mod: '⌘', shift: '⇧', alt: '⌥' };
const OTHER_KEYS: Record<string, string> = { mod: 'Ctrl', shift: 'Shift', alt: 'Alt' };

/** `mod+shift+n` → `['⌘', '⇧', 'N']` on Mac, `['Ctrl', 'Shift', 'N']` elsewhere. */
export function shortcutKeys(shortcut: string, isMac: boolean): string[] {
  const names = isMac ? MAC_KEYS : OTHER_KEYS;
  return shortcut
    .split('+')
    .map((part) => names[part] ?? (part.length === 1 ? part.toUpperCase() : part));
}

/** Words for screen readers: `mod+shift+n` → "Command Shift N" / "Control Shift N". */
export function shortcutLabel(shortcut: string, isMac: boolean): string {
  const words: Record<string, string> = isMac
    ? { mod: 'Command', shift: 'Shift', alt: 'Option' }
    : { mod: 'Control', shift: 'Shift', alt: 'Alt' };
  return shortcut
    .split('+')
    .map((part) => words[part] ?? part.toUpperCase())
    .join(' ');
}
