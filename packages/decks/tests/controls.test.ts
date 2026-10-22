import { describe, expect, it } from 'vitest';
import {
  availableDeckControls,
  DECK_CONTROL_CAPABILITIES,
  DECK_CONTROL_GROUPS,
  DECK_CONTROL_ICONS,
  DECK_CONTROLS,
  DECK_ESCAPE_ORDER,
  DECK_INPUT_ACTIONS,
  DECK_KEY_BINDINGS,
  DEFAULT_DECK_CONTROL_ENVIRONMENT,
  type DeckControl,
  type DeckControlEnvironment,
  type DeckControlKey,
  type DeckInputAction,
  type DeckInputEvent,
  type DeckInputState,
  decideDeckInput,
  deckControlFor,
  deckKeyBindings,
} from '../src/index.ts';

/**
 * The control registry (`DECK_CONTROLS`) is the single source for labels,
 * keys and availability: every deck action has exactly one control, and every
 * key a control lists really reaches that action through the input guard.
 */

/** The deck state under which a control's key acts (its overlay on, debug available…). */
function stateFor(action: DeckInputAction, spec: DeckControlKey): DeckInputState {
  if (action === 'debug') return { debugAvailable: true };
  if (action === 'fullscreen-exit') return { fullscreen: true };
  if (!spec.closes) return {};
  const on: Partial<Record<DeckInputAction, DeckInputState>> = {
    help: { help: true },
    overview: { overview: 'open' },
    blackout: { blackout: true },
    laser: { laser: true },
  };
  return on[action] ?? {};
}

function keyEvent(spec: DeckControlKey): Extract<DeckInputEvent, { kind: 'key' }> {
  return {
    kind: 'key',
    key: spec.key,
    shiftKey: spec.shift === 'required',
    ctrlKey: spec.modifier === 'ctrl',
    metaKey: spec.modifier === 'meta',
  };
}

const env = (overrides: Partial<DeckControlEnvironment>): DeckControlEnvironment => ({
  ...DEFAULT_DECK_CONTROL_ENVIRONMENT,
  ...overrides,
});

describe('DECK_CONTROLS', () => {
  it('has exactly one control for every deck action (AC-registry-complete)', () => {
    const actions = DECK_CONTROLS.map((item) => item.action);
    expect(new Set(actions).size).toBe(actions.length);
    expect([...actions].sort()).toEqual([...DECK_INPUT_ACTIONS].sort());
    for (const action of DECK_INPUT_ACTIONS) expect(deckControlFor(action).action).toBe(action);
    expect(() => deckControlFor('nope' as DeckInputAction)).toThrow(RangeError);
  });

  it("routes every control's keys to its action through decideDeckInput (AC-registry-complete)", () => {
    for (const item of DECK_CONTROLS) {
      for (const spec of item.keys) {
        expect(
          decideDeckInput(keyEvent(spec), stateFor(item.action, spec)),
          `${item.id}: ${spec.label}`
        ).toBe(item.action);
        // Letters work in either case (Caps Lock), unless they need a modifier.
        if (/^[a-z]$/.test(spec.key) && !spec.modifier) {
          expect(
            decideDeckInput(
              { ...keyEvent(spec), key: spec.key.toUpperCase() },
              stateFor(item.action, spec)
            ),
            `${item.id}: ${spec.label.toUpperCase()}`
          ).toBe(item.action);
        }
      }
    }
  });

  it('never gives one key two actions in the same state', () => {
    const seen = new Map<string, DeckInputAction>();
    for (const item of DECK_CONTROLS) {
      for (const spec of item.keys) {
        if (spec.closes) continue;
        const id = `${spec.key.toLowerCase()}|${spec.shift ?? ''}|${spec.modifier ?? ''}`;
        const other = seen.get(id);
        expect(
          other === undefined || other === item.action,
          `${spec.label}: ${other} and ${item.action}`
        ).toBe(true);
        seen.set(id, item.action);
      }
    }
  });

  it('describes each control for a first-time viewer, with a label, icon and group', () => {
    const labels = new Set<string>();
    for (const item of DECK_CONTROLS) {
      expect(item.id).toBe(item.action);
      expect(item.label.trim().length, item.id).toBeGreaterThan(0);
      expect(labels.has(item.label), `duplicate label ${item.label}`).toBe(false);
      labels.add(item.label);
      expect(item.description.trim().length, item.id).toBeGreaterThan(0);
      expect(item.description.length, `${item.id} description length`).toBeLessThanOrEqual(120);
      expect(item.description.endsWith('.'), `${item.id} description ends with a period`).toBe(
        true
      );
      expect(DECK_CONTROL_ICONS).toContain(item.icon);
      expect(DECK_CONTROL_GROUPS).toContain(item.group);
      for (const need of item.requires) expect(DECK_CONTROL_CAPABILITIES).toContain(need);
      for (const spec of item.keys)
        expect(spec.label.trim().length, `${item.id} key label`).toBeGreaterThan(0);
    }
  });

  it('lists the controls in group order', () => {
    const order = DECK_CONTROLS.map((item) => DECK_CONTROL_GROUPS.indexOf(item.group));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('is frozen, so a consumer cannot change what everyone else reads', () => {
    expect(Object.isFrozen(DECK_CONTROLS)).toBe(true);
    for (const item of DECK_CONTROLS) {
      expect(Object.isFrozen(item)).toBe(true);
      expect(Object.isFrozen(item.keys)).toBe(true);
    }
  });
});

describe('availability', () => {
  it('needs every capability a control requires', () => {
    const control = (action: DeckInputAction): DeckControl => deckControlFor(action);
    expect(
      control('next').available(env({ fullscreen: false, clipboard: false, print: false }))
    ).toBe(true);
    expect(control('fullscreen').available(env({ fullscreen: false }))).toBe(false);
    expect(control('copy-link').available(env({ clipboard: false }))).toBe(false);
    expect(control('print').available(env({ print: false }))).toBe(false);
    // The presenter opens beside the deck when a popup is refused, so it always works.
    expect(control('presenter').available(env({ popup: false }))).toBe(true);
    expect(control('debug').available(DEFAULT_DECK_CONTROL_ENVIRONMENT)).toBe(false);
    expect(control('debug').available(env({ debug: true }))).toBe(true);
  });

  it('lists only what works, and the debug key only where debug is on', () => {
    expect(availableDeckControls().map((item) => item.action)).not.toContain('debug');
    expect(availableDeckControls(env({ debug: true })).map((item) => item.action)).toContain(
      'debug'
    );
    expect(DECK_KEY_BINDINGS).toEqual(deckKeyBindings(DEFAULT_DECK_CONTROL_ENVIRONMENT));
    expect(DECK_KEY_BINDINGS.map((binding) => binding.action)).not.toContain('debug');
    expect(deckKeyBindings(env({ debug: true })).find((b) => b.action === 'debug')?.keys).toEqual([
      'D',
    ]);
    // A control without keys (copy-link) is a button only.
    expect(DECK_KEY_BINDINGS.map((binding) => binding.action)).not.toContain('copy-link');
    for (const binding of DECK_KEY_BINDINGS) {
      expect(binding.keys).toEqual(deckControlFor(binding.action).keys.map((key) => key.label));
      expect(binding.label).toBe(deckControlFor(binding.action).label);
    }
  });
});

describe('new keys', () => {
  const esc: DeckInputEvent = { kind: 'key', key: 'Escape' };

  it('leaves full screen with Esc, only in full screen and after the overlays it already closes', () => {
    expect(decideDeckInput(esc)).toBeNull();
    expect(decideDeckInput(esc, { fullscreen: true })).toBe('fullscreen-exit');
    expect(decideDeckInput(esc, { fullscreen: true, help: true })).toBe('help');
    expect(decideDeckInput(esc, { fullscreen: true, overview: 'open' })).toBe('overview');
    expect(decideDeckInput(esc, { fullscreen: true, blackout: true })).toBe('blackout');
    expect(decideDeckInput(esc, { fullscreen: true, laser: true })).toBe('laser');
    expect(decideDeckInput({ ...esc, repeat: true }, { fullscreen: true })).toBeNull();
    expect(DECK_ESCAPE_ORDER).toEqual(['help', 'overview', 'blackout', 'laser', 'fullscreen-exit']);
  });

  it('has an Esc entry for every control that Esc closes, and nothing else', () => {
    const closable = DECK_CONTROLS.filter((item) =>
      item.keys.some((key) => key.key === 'Escape')
    ).map((item) => item.action);
    expect([...closable].sort()).toEqual([...DECK_ESCAPE_ORDER].sort());
  });

  it('opens debug with D only when debug is available, never while typing or in an overlay', () => {
    const d: DeckInputEvent = { kind: 'key', key: 'd' };
    expect(decideDeckInput(d)).toBeNull();
    expect(decideDeckInput(d, { debugAvailable: true })).toBe('debug');
    expect(decideDeckInput({ ...d, key: 'D' }, { debugAvailable: true })).toBe('debug');
    expect(decideDeckInput({ ...d, shiftKey: true }, { debugAvailable: true })).toBeNull();
    expect(decideDeckInput({ ...d, repeat: true }, { debugAvailable: true })).toBeNull();
    expect(decideDeckInput({ ...d, ctrlKey: true }, { debugAvailable: true })).toBeNull();
    expect(decideDeckInput(d, { debugAvailable: true, help: true })).toBeNull();
    expect(decideDeckInput(d, { debugAvailable: true, blackout: true })).toBeNull();
    expect(
      decideDeckInput({ ...d, path: [{ tag: 'input' }] }, { debugAvailable: true })
    ).toBeNull();
  });
});
