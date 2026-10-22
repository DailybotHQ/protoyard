/** A host-defined context in which a shortcut is available. */
export type HotkeyScope = string;

/**
 * Display-only shortcut data. Hosts own key registration and event dispatch;
 * this package only filters and formats these bindings.
 */
export interface HotkeyBinding {
  id: string;
  label: string;
  group: string;
  /** Alternative chords or sequences, e.g. `['mod+k', 'g m']`. */
  keys: readonly string[];
  /** Missing scopes (or `global`) means the binding is always available. */
  scopes?: readonly HotkeyScope[];
}

export type HotkeyPlatform = 'mac' | 'other';

const MODIFIERS: Record<string, { mac: string; other: string }> = {
  mod: { mac: '⌘', other: 'Ctrl' },
  meta: { mac: '⌘', other: 'Ctrl' },
  control: { mac: '⌃', other: 'Ctrl' },
  ctrl: { mac: '⌃', other: 'Ctrl' },
  shift: { mac: '⇧', other: 'Shift' },
  alt: { mac: '⌥', other: 'Alt' },
  option: { mac: '⌥', other: 'Alt' },
};

const KEY_LABELS: Record<string, string> = {
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  backspace: '⌫',
  delete: 'Del',
  enter: '↵',
  escape: 'Esc',
  space: 'Space',
  tab: 'Tab',
};

function formatKey(key: string): string {
  const normalized = key.toLowerCase();
  return (
    KEY_LABELS[normalized] ?? (key.length === 1 ? key.toUpperCase() : key.replace(/^key/i, ''))
  );
}

/** Formats one chord such as `mod+shift+n` without reading browser globals. */
export function formatHotkeyChord(chord: string, platform: HotkeyPlatform): string {
  const parts = chord
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.pop();
  if (
    !key ||
    MODIFIERS[key.toLowerCase()] ||
    parts.some((part) => !MODIFIERS[part.toLowerCase()])
  ) {
    throw new RangeError(`hotkey chord "${chord}" must end with one key after supported modifiers`);
  }
  const modifiers = parts.map((part) => MODIFIERS[part.toLowerCase()]?.[platform] ?? part);
  const renderedKey = formatKey(key);
  return platform === 'mac'
    ? [...modifiers, renderedKey].join('')
    : [...modifiers, renderedKey].join('+');
}

/** Formats each alternative binding, spelling space-separated sequences with `then`. */
export function formatHotkeyKeys(
  binding: Pick<HotkeyBinding, 'keys'>,
  platform: HotkeyPlatform
): string[] {
  return binding.keys.map((sequence) => {
    const normalized = sequence.trim();
    if (!normalized) {
      throw new RangeError('hotkey sequence must contain at least one chord');
    }
    return normalized
      .split(/\s+/)
      .filter(Boolean)
      .map((chord) => formatHotkeyChord(chord, platform))
      .join(' then ');
  });
}

/** Returns bindings visible in the active scopes; unscoped and global bindings always show. */
export function filterHotkeyBindings(
  bindings: readonly HotkeyBinding[],
  activeScopes?: readonly HotkeyScope[]
): HotkeyBinding[] {
  if (!activeScopes) return [...bindings];
  const active = new Set(activeScopes);
  return bindings.filter(
    (binding) =>
      !binding.scopes?.length ||
      binding.scopes.includes('global') ||
      binding.scopes.some((scope) => active.has(scope))
  );
}
