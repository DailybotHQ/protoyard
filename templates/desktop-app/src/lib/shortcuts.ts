/**
 * Keyboard shortcuts as data: the key handler, the menu bar hints and the
 * help dialog all read this one table, so they can never disagree.
 *
 * Browsers reserve some combinations for themselves and never deliver them
 * to a page (Ctrl/⌘+N, +W, +T, +Q). The app uses Alt/⌥ for "new" and
 * "close" instead, and matches letters by `event.code`, so ⌥N works on a
 * Mac keyboard even though it types "˜".
 */

export type ShortcutId =
  | 'new-document'
  | 'new-folder'
  | 'save'
  | 'search'
  | 'close'
  | 'toggle-sidebar'
  | 'help';

export interface Shortcut {
  id: ShortcutId;
  label: string;
  /** `KeyboardEvent.code` (layout-independent) or, for symbols, `KeyboardEvent.key`. */
  code?: string;
  key?: string;
  /** ⌘ on macOS, Ctrl elsewhere. */
  mod?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** Fires while typing in a field (save, search…); plain-key shortcuts never do. */
  inFields: boolean;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'new-document', label: 'New document', code: 'KeyN', alt: true, inFields: true },
  { id: 'new-folder', label: 'New folder', code: 'KeyN', alt: true, shift: true, inFields: true },
  { id: 'save', label: 'Save document', code: 'KeyS', mod: true, inFields: true },
  { id: 'search', label: 'Search documents', code: 'KeyK', mod: true, inFields: true },
  { id: 'close', label: 'Close document', code: 'KeyW', alt: true, inFields: true },
  {
    id: 'toggle-sidebar',
    label: 'Show or hide the sidebar',
    code: 'Backslash',
    mod: true,
    inFields: true,
  },
  { id: 'help', label: 'Keyboard shortcuts', key: '?', shift: true, inFields: false },
];

export interface KeyLike {
  code: string;
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export function isMacPlatform(
  platform: string = typeof navigator === 'undefined' ? '' : navigator.platform
): boolean {
  return /mac|iphone|ipad/i.test(platform);
}

/** True when focus is in something the user types into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const el = target as HTMLElement;
  return (
    el.isContentEditable || el.closest('input, textarea, select, [contenteditable="true"]') !== null
  );
}

export function matches(event: KeyLike, shortcut: Shortcut, mac: boolean): boolean {
  const mod = mac ? event.metaKey : event.ctrlKey;
  const extraMod = mac ? event.ctrlKey : event.metaKey;
  if (Boolean(shortcut.mod) !== mod || extraMod) return false;
  if (Boolean(shortcut.alt) !== event.altKey) return false;
  if (Boolean(shortcut.shift) !== event.shiftKey) return false;
  return shortcut.code ? event.code === shortcut.code : event.key === shortcut.key;
}

/** The shortcut an event triggers, if any. */
export function shortcutFor(
  event: KeyLike,
  { mac, typing }: { mac: boolean; typing: boolean }
): Shortcut | undefined {
  return SHORTCUTS.find((s) => (s.inFields || !typing) && matches(event, s, mac));
}

const KEY_LABELS: Record<string, string> = { Backslash: '\\', Slash: '/' };

/** "⌥N", "⌘S", "?" on macOS; "Alt+N", "Ctrl+S", "?" elsewhere. */
export function formatShortcut(shortcut: Shortcut, mac: boolean): string {
  const key =
    shortcut.key ?? KEY_LABELS[shortcut.code ?? ''] ?? (shortcut.code ?? '').replace(/^Key/, '');
  if (shortcut.key) return key;
  const parts = mac
    ? [shortcut.mod && '⌘', shortcut.alt && '⌥', shortcut.shift && '⇧', key]
    : [shortcut.mod && 'Ctrl', shortcut.alt && 'Alt', shortcut.shift && 'Shift', key];
  return parts.filter(Boolean).join(mac ? '' : '+');
}

export function shortcutLabel(id: ShortcutId, mac: boolean): string {
  const shortcut = SHORTCUTS.find((s) => s.id === id);
  return shortcut ? formatShortcut(shortcut, mac) : '';
}
