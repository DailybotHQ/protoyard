import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  escapeSelectorValue,
  findOption,
  type RovingEntry,
  rovingKeydown,
  rovingTabIndex,
} from '../src/lib/roving.ts';

afterEach(() => {
  document.body.replaceChildren();
});

const ENTRIES: readonly RovingEntry[] = [
  { value: 'alpha' },
  { value: 'beta' },
  { value: 'gamma', disabled: true },
  { value: 'delta' },
];

function mountGroup(
  role: 'radiogroup' | 'tablist',
  entries: readonly RovingEntry[] = ENTRIES
): { group: HTMLElement; buttons: HTMLButtonElement[] } {
  const group = document.createElement('div');
  group.setAttribute('role', role);
  const buttons: HTMLButtonElement[] = [];
  for (const entry of entries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.value = entry.value;
    button.textContent = entry.value;
    if (entry.disabled) button.disabled = true;
    button.tabIndex = -1;
    group.append(button);
    buttons.push(button);
  }
  document.body.append(group);
  return { group, buttons };
}

function keyEvent(
  target: HTMLElement,
  key: string,
  currentTarget: EventTarget = target
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'currentTarget', { configurable: true, value: currentTarget });
  target.dispatchEvent(event);
  return event;
}

describe('escapeSelectorValue and findOption', () => {
  it('escapes special characters for callers that still build CSS selectors', () => {
    expect(escapeSelectorValue('plain')).toBe('plain');
    expect(escapeSelectorValue('a"b')).not.toBe('a"b');
  });

  it('finds options by data-value equality for arbitrary strings', () => {
    const tricky = 'x][data-x="y"';
    const group = document.createElement('div');
    const el = document.createElement('button');
    el.setAttribute('data-value', tricky);
    group.append(el);
    document.body.append(group);
    expect(findOption(group, tricky)).toBe(el);
    expect(findOption(group, 'missing')).toBeNull();
  });
});

describe('rovingTabIndex', () => {
  it('keeps only the selected option in the tab order', () => {
    expect(rovingTabIndex('beta', 'alpha', ENTRIES)).toBe(-1);
    expect(rovingTabIndex('beta', 'beta', ENTRIES)).toBe(0);
    expect(rovingTabIndex('beta', 'delta', ENTRIES)).toBe(-1);
  });

  it('falls back to the first enabled option when nothing is selected', () => {
    expect(rovingTabIndex('', 'alpha', ENTRIES)).toBe(0);
    expect(rovingTabIndex('', 'beta', ENTRIES)).toBe(-1);
    const startsDisabled: RovingEntry[] = [{ value: 'off', disabled: true }, { value: 'on' }];
    expect(rovingTabIndex('', 'off', startsDisabled)).toBe(-1);
    expect(rovingTabIndex('', 'on', startsDisabled)).toBe(0);
  });
});

describe('rovingKeydown', () => {
  it('moves Right/Down with wraparound and skips disabled entries', () => {
    const { buttons } = mountGroup('radiogroup');
    const select = vi.fn();
    const focusSpy = vi.spyOn(buttons[3]!, 'focus');

    // alpha → delta (skips disabled gamma)
    const right = keyEvent(buttons[0]!, 'ArrowRight', buttons[0]!);
    expect(rovingKeydown(right, ENTRIES, 'alpha', select)).toBe(true);
    expect(right.defaultPrevented).toBe(true);
    expect(select).toHaveBeenCalledWith('beta');

    select.mockClear();
    const fromBeta = keyEvent(buttons[1]!, 'ArrowDown', buttons[1]!);
    expect(rovingKeydown(fromBeta, ENTRIES, 'beta', select)).toBe(true);
    expect(select).toHaveBeenCalledWith('delta');
    expect(focusSpy).toHaveBeenCalled();

    select.mockClear();
    const wrap = keyEvent(buttons[3]!, 'ArrowRight', buttons[3]!);
    expect(rovingKeydown(wrap, ENTRIES, 'delta', select)).toBe(true);
    expect(select).toHaveBeenCalledWith('alpha');
  });

  it('moves Left/Up with wraparound and skips disabled entries', () => {
    const { buttons } = mountGroup('tablist');
    const select = vi.fn();

    const left = keyEvent(buttons[0]!, 'ArrowLeft', buttons[0]!);
    expect(rovingKeydown(left, ENTRIES, 'alpha', select)).toBe(true);
    expect(select).toHaveBeenCalledWith('delta');

    select.mockClear();
    const up = keyEvent(buttons[3]!, 'ArrowUp', buttons[3]!);
    expect(rovingKeydown(up, ENTRIES, 'delta', select)).toBe(true);
    expect(select).toHaveBeenCalledWith('beta');
  });

  it('jumps Home and End to the first and last enabled entries', () => {
    const { buttons } = mountGroup('radiogroup');
    const select = vi.fn();
    const homeFocus = vi.spyOn(buttons[0]!, 'focus');
    const endFocus = vi.spyOn(buttons[3]!, 'focus');

    const end = keyEvent(buttons[1]!, 'End', buttons[1]!);
    expect(rovingKeydown(end, ENTRIES, 'beta', select)).toBe(true);
    expect(select).toHaveBeenCalledWith('delta');
    expect(endFocus).toHaveBeenCalled();

    select.mockClear();
    const home = keyEvent(buttons[3]!, 'Home', buttons[3]!);
    expect(rovingKeydown(home, ENTRIES, 'delta', select)).toBe(true);
    expect(select).toHaveBeenCalledWith('alpha');
    expect(homeFocus).toHaveBeenCalled();
  });

  it('ignores non-roving keys and empty enabled lists', () => {
    const { buttons } = mountGroup('radiogroup');
    const select = vi.fn();
    const other = keyEvent(buttons[0]!, 'Enter', buttons[0]!);
    expect(rovingKeydown(other, ENTRIES, 'alpha', select)).toBe(false);
    expect(other.defaultPrevented).toBe(false);
    expect(select).not.toHaveBeenCalled();

    expect(rovingKeydown(other, [{ value: 'x', disabled: true }], 'x', select)).toBe(false);
  });

  it('selects the first enabled entry when current is unknown', () => {
    const { buttons } = mountGroup('radiogroup');
    const select = vi.fn();
    const event = keyEvent(buttons[0]!, 'ArrowRight', buttons[0]!);
    expect(rovingKeydown(event, ENTRIES, '', select)).toBe(true);
    expect(select).toHaveBeenCalledWith('alpha');
  });

  it('focuses the matching data-value inside a tablist group', () => {
    const { buttons } = mountGroup('tablist');
    const select = vi.fn();
    const focusSpy = vi.spyOn(buttons[1]!, 'focus');
    const event = keyEvent(buttons[0]!, 'ArrowRight', buttons[0]!);
    rovingKeydown(event, ENTRIES, 'alpha', select);
    expect(focusSpy).toHaveBeenCalled();
  });

  it('handles values that need CSS.escape in the selector', () => {
    const entries: RovingEntry[] = [{ value: 'a:b' }, { value: 'c.d"e' }];
    const { buttons } = mountGroup('radiogroup', entries);
    const select = vi.fn();
    const focusSpy = vi.spyOn(buttons[1]!, 'focus');
    const event = keyEvent(buttons[0]!, 'ArrowRight', buttons[0]!);
    expect(rovingKeydown(event, entries, 'a:b', select)).toBe(true);
    expect(select).toHaveBeenCalledWith('c.d"e');
    expect(focusSpy).toHaveBeenCalled();
  });
});
