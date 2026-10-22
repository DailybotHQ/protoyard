/**
 * Arrow-key navigation for a group of single-choice controls (radiogroup or
 * tablist): Left/Up and Right/Down move with wrap-around, Home and End jump to
 * the ends, disabled entries are skipped. Selection follows focus.
 *
 * Callers put `data-value` on each focusable option and set `tabindex` so only
 * the selected (or first) option is in the tab order. Wire `onkeydown` on each
 * option to `rovingKeydown`.
 */

export type RovingEntry = {
  value: string;
  disabled?: boolean;
};

/** Escape a value for use inside a CSS attribute selector. */
export function escapeSelectorValue(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  // Fallback for hosts without CSS.escape: escape characters that break [attr="…"].
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Handle a keydown on a roving option. Returns true when the event was handled
 * (and default was prevented); false when the key is not a roving key.
 */
export function rovingKeydown(
  event: KeyboardEvent,
  entries: readonly RovingEntry[],
  current: string,
  select: (value: string) => void
): boolean {
  const enabled = entries.filter((entry) => !entry.disabled);
  if (enabled.length === 0) return false;

  let index = enabled.findIndex((entry) => entry.value === current);
  // Unknown or empty current: start just before the first enabled entry so
  // ArrowRight/Down land on index 0 and ArrowLeft/Up wrap to the last.
  if (index < 0) index = -1;

  let next: number;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    next = (index + 1) % enabled.length;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    next = (index - 1 + enabled.length) % enabled.length;
  } else if (event.key === 'Home') {
    next = 0;
  } else if (event.key === 'End') {
    next = enabled.length - 1;
  } else {
    return false;
  }

  event.preventDefault();
  const target = enabled[next];
  if (!target) return false;

  select(target.value);

  const currentTarget = event.currentTarget;
  if (!(currentTarget instanceof Element)) return true;

  const group = currentTarget.closest('[role="radiogroup"],[role="tablist"]');
  findOption(group, target.value)?.focus();
  return true;
}

/**
 * Find a roving option by its `data-value`. Uses attribute equality instead of
 * a CSS selector so arbitrary values (quotes, brackets, colons) stay safe.
 */
export function findOption(group: Element | null | undefined, value: string): HTMLElement | null {
  if (!group) return null;
  const candidates = group.querySelectorAll<HTMLElement>('[data-value]');
  for (const el of candidates) {
    if (el.getAttribute('data-value') === value) return el;
  }
  return null;
}

/**
 * Tabindex for a roving option: the selected value is 0; when nothing is
 * selected the first enabled option is 0; every other option is -1.
 */
export function rovingTabIndex(
  value: string,
  entryValue: string,
  entries: readonly RovingEntry[]
): 0 | -1 {
  if (value === entryValue) return 0;
  if (value) return -1;
  const firstEnabled = entries.find((entry) => !entry.disabled);
  return firstEnabled?.value === entryValue ? 0 : -1;
}
