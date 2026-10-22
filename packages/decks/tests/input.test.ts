import { describe, expect, it } from 'vitest';
import {
  DECK_CHROME_ATTRIBUTE,
  DECK_INPUT_ACTIONS,
  DECK_INTERACTIVE_ATTRIBUTE,
  DECK_KEY_BINDINGS,
  DECK_SWIPE_MIN_DISTANCE,
  type DeckInputEvent,
  type DeckInputState,
  type DeckInputTarget,
  decideDeckInput,
  inputPathFrom,
} from '../src/index.ts';

const slide: DeckInputTarget[] = [{ tag: 'p' }, { tag: 'section' }, { tag: 'div' }];
const key = (
  k: string,
  extra: Partial<Extract<DeckInputEvent, { kind: 'key' }>> = {}
): DeckInputEvent => ({
  kind: 'key',
  key: k,
  ...extra,
});
const click = (
  path: DeckInputTarget[] = slide,
  extra: Partial<Extract<DeckInputEvent, { kind: 'click' }>> = {}
): DeckInputEvent => ({ kind: 'click', path, ...extra });
const swipe = (
  dx: number,
  dy: number,
  extra: Partial<Extract<DeckInputEvent, { kind: 'swipe' }>> = {}
): DeckInputEvent => ({
  kind: 'swipe',
  dx,
  dy,
  pointerType: 'touch',
  durationMs: 200,
  path: slide,
  ...extra,
});
const inside = (...outer: DeckInputTarget[]) => [{ tag: 'span' }, ...outer, ...slide];

describe('keyboard', () => {
  it.each([
    ['ArrowRight', 'next'],
    ['ArrowDown', 'next'],
    ['PageDown', 'next'],
    [' ', 'next'],
    ['ArrowLeft', 'prev'],
    ['ArrowUp', 'prev'],
    ['PageUp', 'prev'],
    ['Home', 'first'],
    ['End', 'last'],
    ['o', 'overview'],
    ['O', 'overview'],
    ['s', 'presenter'],
    ['p', 'presenter'],
    ['f', 'fullscreen'],
    ['b', 'blackout'],
    ['.', 'blackout'],
    ['l', 'laser'],
  ] as const)('%j → %s', (k, action) => {
    expect(decideDeckInput(key(k))).toBe(action);
  });

  it('maps Shift+Space to prev, ? (with Shift) to help and Ctrl/Cmd+P to print', () => {
    expect(decideDeckInput(key(' ', { shiftKey: true }))).toBe('prev');
    expect(decideDeckInput(key('?', { shiftKey: true }))).toBe('help');
    expect(decideDeckInput(key('p', { ctrlKey: true }))).toBe('print');
    expect(decideDeckInput(key('P', { metaKey: true }))).toBe('print');
  });

  it('leaves browser shortcuts, typing and IME composition alone', () => {
    for (const event of [
      key('ArrowRight', { altKey: true }),
      key('ArrowRight', { metaKey: true }),
      key('f', { ctrlKey: true }),
      key('p', { ctrlKey: true, altKey: true }),
      key('O', { shiftKey: true }),
      key('ArrowRight', { shiftKey: true }),
      key('a'),
      key('Enter'),
      key('Tab'),
      key('ArrowRight', { isComposing: true }),
      key('ArrowRight', { path: [{ tag: 'input' }, ...slide] }),
      key('o', { path: [{ tag: 'textarea' }] }),
      key(' ', { path: [{ tag: 'div', editable: true }] }),
      key('b', { path: [{ tag: 'div', role: 'textbox' }] }),
    ]) {
      expect(decideDeckInput(event), JSON.stringify(event)).toBeNull();
    }
  });

  it('lets a focused control keep its arrows and Space', () => {
    expect(
      decideDeckInput(key('ArrowRight', { path: [{ tag: 'div', role: 'slider' }] }))
    ).toBeNull();
    expect(decideDeckInput(key(' ', { path: [{ tag: 'button' }] }))).toBeNull();
    expect(
      decideDeckInput(
        key('ArrowLeft', { path: inside({ tag: 'div', attributes: [DECK_INTERACTIVE_ATTRIBUTE] }) })
      )
    ).toBeNull();
    // Toggles still work from a focused button (it does not use letters).
    expect(decideDeckInput(key('o', { path: [{ tag: 'button' }] }))).toBe('overview');
  });

  it('never repeats a toggle on key repeat, but repeats navigation', () => {
    expect(decideDeckInput(key('b', { repeat: true }))).toBeNull();
    expect(decideDeckInput(key('p', { ctrlKey: true, repeat: true }))).toBeNull();
    expect(decideDeckInput(key('ArrowRight', { repeat: true }))).toBe('next');
  });

  it('routes Escape to whatever is open, innermost first', () => {
    expect(decideDeckInput(key('Escape'))).toBeNull();
    expect(decideDeckInput(key('Escape'), { help: true, overview: 'open' })).toBe('help');
    expect(decideDeckInput(key('Escape'), { overview: 'open', blackout: true })).toBe('overview');
    expect(decideDeckInput(key('Escape'), { blackout: true, laser: true })).toBe('blackout');
    expect(decideDeckInput(key('Escape'), { laser: true })).toBe('laser');
    expect(decideDeckInput(key('Escape', { repeat: true }), { laser: true })).toBeNull();
  });

  it('gives the overview, help and blackout their own keys only', () => {
    const open: DeckInputState = { overview: 'open' };
    expect(decideDeckInput(key('ArrowRight'), open)).toBeNull();
    expect(decideDeckInput(key('b'), open)).toBeNull();
    expect(decideDeckInput(key('o'), open)).toBe('overview');
    expect(decideDeckInput(key('ArrowRight'), { help: true })).toBeNull();
    expect(decideDeckInput(key('?', { shiftKey: true }), { help: true })).toBe('help');
    expect(decideDeckInput(key('ArrowRight'), { blackout: true })).toBeNull();
    expect(decideDeckInput(key('.'), { blackout: true })).toBe('blackout');
    // While the overview closes, nothing slips through.
    for (const k of ['ArrowRight', 'o', 'b', ' ']) {
      expect(decideDeckInput(key(k), { overview: 'closing' })).toBeNull();
    }
  });
});

describe('guarded click advance', () => {
  it('advances on a plain primary click on slide content', () => {
    expect(decideDeckInput(click())).toBe('next');
    expect(decideDeckInput(click(slide, { button: 0, selectionLength: 0 }))).toBe('next');
  });

  const guarded: [string, DeckInputEvent, DeckInputState?][] = [
    ['secondary button', click(slide, { button: 2 })],
    ['middle button', click(slide, { button: 1 })],
    ['Shift', click(slide, { shiftKey: true })],
    ['Ctrl', click(slide, { ctrlKey: true })],
    ['Meta', click(slide, { metaKey: true })],
    ['Alt', click(slide, { altKey: true })],
    ['text selection', click(slide, { selectionLength: 12 })],
    ['a link', click(inside({ tag: 'a', href: true }))],
    ['an anchor without href', click(inside({ tag: 'a' }))],
    ['a button', click(inside({ tag: 'button' }))],
    ['an input', click([{ tag: 'input' }, ...slide])],
    ['a select', click([{ tag: 'select' }, ...slide])],
    ['a textarea', click([{ tag: 'textarea' }, ...slide])],
    ['a label', click(inside({ tag: 'label' }))],
    ['a summary', click(inside({ tag: 'summary' }))],
    ['an iframe', click([{ tag: 'iframe' }, ...slide])],
    ['a video', click([{ tag: 'video' }, ...slide])],
    ['an audio player', click([{ tag: 'audio' }, ...slide])],
    ['a role=button', click(inside({ tag: 'div', role: 'button' }))],
    ['a role=tab', click(inside({ tag: 'div', role: 'tab' }))],
    ['a role=slider', click(inside({ tag: 'div', role: 'slider' }))],
    ['contenteditable', click(inside({ tag: 'div', editable: true }))],
    [
      'an interactive block',
      click(inside({ tag: 'div', attributes: [DECK_INTERACTIVE_ATTRIBUTE] })),
    ],
    [
      'deck chrome (progress, slide number)',
      click(inside({ tag: 'div', attributes: [DECK_CHROME_ATTRIBUTE] })),
    ],
    ['the overview is open', click(), { overview: 'open' }],
    // The Reveal bug: the click that closes the overview landed while it was deactivating.
    ['the overview is closing', click(), { overview: 'closing' }],
    ['help is open', click(), { help: true }],
    ['the screen is blacked out', click(), { blackout: true }],
    ['the laser pointer is on', click(), { laser: true }],
  ];

  it.each(guarded)('never advances on %s', (_name, event, state) => {
    expect(decideDeckInput(event, state)).toBeNull();
  });
});

describe('swipe', () => {
  it('maps a horizontal swipe left to next and right to prev', () => {
    expect(decideDeckInput(swipe(-120, 10))).toBe('next');
    expect(decideDeckInput(swipe(120, -10))).toBe('prev');
    expect(decideDeckInput(swipe(-DECK_SWIPE_MIN_DISTANCE, 0))).toBe('next');
    expect(decideDeckInput(swipe(-120, 10, { pointerType: 'pen' }))).toBe('next');
  });

  it('needs distance, a locked horizontal axis and speed', () => {
    expect(decideDeckInput(swipe(-(DECK_SWIPE_MIN_DISTANCE - 1), 0))).toBeNull();
    expect(decideDeckInput(swipe(-100, 80))).toBeNull();
    expect(decideDeckInput(swipe(-20, -200))).toBeNull();
    expect(decideDeckInput(swipe(-150, 99))).toBe('next');
    expect(decideDeckInput(swipe(-150, 101))).toBeNull();
    expect(decideDeckInput(swipe(-200, 0, { durationMs: 1_500 }))).toBeNull();
  });

  it('ignores mouse drags, bad numbers, guarded targets and open overlays', () => {
    expect(decideDeckInput(swipe(-200, 0, { pointerType: 'mouse' }))).toBeNull();
    expect(decideDeckInput(swipe(Number.NaN, 0))).toBeNull();
    expect(decideDeckInput(swipe(Number.NEGATIVE_INFINITY, 0))).toBeNull();
    expect(
      decideDeckInput(
        swipe(-200, 0, { path: inside({ tag: 'div', attributes: [DECK_INTERACTIVE_ATTRIBUTE] }) })
      )
    ).toBeNull();
    expect(decideDeckInput(swipe(-200, 0, { path: [{ tag: 'iframe' }] }))).toBeNull();
    expect(decideDeckInput(swipe(-200, 0), { overview: 'open' })).toBeNull();
    expect(decideDeckInput(swipe(-200, 0), { overview: 'closing' })).toBeNull();
    expect(decideDeckInput(swipe(-200, 0), { blackout: true })).toBeNull();
    expect(decideDeckInput(swipe(-200, 0), { help: true })).toBeNull();
  });
});

describe('inputPathFrom', () => {
  /** A minimal element double (no DOM needed). */
  const el = (tag: string, attrs: Record<string, string> = {}, editable = false) => ({
    tagName: tag.toUpperCase(),
    isContentEditable: editable,
    getAttribute: (name: string) => (Object.hasOwn(attrs, name) ? (attrs[name] as string) : null),
    hasAttribute: (name: string) => Object.hasOwn(attrs, name),
  });

  it('describes element facts and skips non-elements', () => {
    const root = el('div', { [DECK_CHROME_ATTRIBUTE]: '' });
    const path = inputPathFrom([
      { nodeType: 3 },
      el('a', { href: '#x' }),
      el('span', { role: 'button' }),
      el('div', { [DECK_INTERACTIVE_ATTRIBUTE]: '' }, true),
      root,
      el('main'),
      null,
      'window',
    ]);
    expect(path).toEqual([
      { tag: 'a', href: true },
      { tag: 'span', role: 'button' },
      { tag: 'div', editable: true, attributes: [DECK_INTERACTIVE_ATTRIBUTE] },
      { tag: 'div', attributes: [DECK_CHROME_ATTRIBUTE] },
      { tag: 'main' },
    ]);
    expect(inputPathFrom([el('p'), root, el('body')], root)).toEqual([{ tag: 'p' }]);
  });

  it('feeds decideDeckInput end to end', () => {
    const real = inputPathFrom([el('strong'), el('button'), el('section')]);
    expect(decideDeckInput({ kind: 'click', path: real })).toBeNull();
    expect(
      decideDeckInput({ kind: 'click', path: inputPathFrom([el('strong'), el('section')]) })
    ).toBe('next');
  });
});

describe('bindings for a help overlay', () => {
  it('lists every action that has a key for a normal viewer', () => {
    // Every action now has a control (tests/controls.test.ts); a binding exists for
    // each control with keys that works by default (copy-link is a button, debug is opt-in).
    const covered = new Set(DECK_KEY_BINDINGS.map((binding) => binding.action));
    for (const action of DECK_INPUT_ACTIONS) {
      const keyless = action === 'copy-link' || action === 'jump' || action === 'debug';
      expect(covered.has(action), action).toBe(!keyless);
    }
    for (const binding of DECK_KEY_BINDINGS) {
      expect(binding.keys.length).toBeGreaterThan(0);
      expect(binding.label.length).toBeGreaterThan(0);
    }
  });
});
