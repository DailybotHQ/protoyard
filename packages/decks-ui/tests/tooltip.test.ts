import { DECK_CONTROLS, deckControlFor } from '@protoyard/decks';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  controlTooltip,
  createTooltipController,
  placeTooltip,
  shortcutText,
  TOOLTIP_HOVER_DELAY_MS,
  TOOLTIP_LINGER_MS,
  TOOLTIP_LONG_PRESS_MS,
} from '../src/chrome/tooltip.ts';
import TooltipHarness from './fixtures/TooltipHarness.svelte';

/**
 * The deck chrome tooltip (AC-tooltip-behavior): it opens on hover after a
 * delay, at once on keyboard focus and on a long press, closes on Escape
 * alone, and describes its button to assistive tech with visible text.
 */

describe('tooltip content from the control registry', () => {
  it('names the shortcut in a sentence', () => {
    expect(shortcutText(deckControlFor('fullscreen').keys)).toBe('Press F.');
    expect(shortcutText(deckControlFor('presenter').keys)).toBe('Press S or P.');
    expect(shortcutText(deckControlFor('next').keys)).toBe('Press →, ↓, Page Down or Space.');
    expect(shortcutText(deckControlFor('overview').keys)).toBe('Press O. Esc closes it.');
    expect(shortcutText(deckControlFor('fullscreen-exit').keys)).toBe('Press Esc.');
    expect(shortcutText(deckControlFor('copy-link').keys)).toBeNull();
  });

  it('pairs the label (or the current state) with the description', () => {
    const fullscreen = deckControlFor('fullscreen');
    expect(controlTooltip(fullscreen)).toEqual({
      title: 'Full screen',
      description: fullscreen.description,
      shortcut: 'Press F.',
    });
    expect(controlTooltip(fullscreen, 'Leave full screen').title).toBe('Leave full screen');
    for (const control of DECK_CONTROLS) {
      const content = controlTooltip(control);
      expect(content.title.length, control.id).toBeGreaterThan(0);
      expect(content.description.length, control.id).toBeGreaterThan(0);
    }
  });
});

describe('placement', () => {
  const viewport = { width: 1000, height: 700 };
  const tip = { width: 200, height: 60 };

  it('sits centered above its button', () => {
    expect(placeTooltip({ x: 400, y: 600, width: 40, height: 40 }, tip, viewport)).toEqual({
      x: 320,
      y: 532,
    });
  });

  it('flips below when the top has no room', () => {
    expect(placeTooltip({ x: 400, y: 10, width: 40, height: 40 }, tip, viewport)).toMatchObject({
      y: 58,
    });
  });

  it('slides sideways to stay inside the viewport', () => {
    expect(placeTooltip({ x: 0, y: 600, width: 40, height: 40 }, tip, viewport).x).toBe(8);
    expect(placeTooltip({ x: 980, y: 600, width: 20, height: 40 }, tip, viewport).x).toBe(792);
  });
});

describe('the tooltip state machine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function make(suppressed = false) {
    const changes: (string | null)[] = [];
    const controller = createTooltipController<string>({
      onChange: (anchor) => changes.push(anchor),
      suppressed: () => suppressed,
    });
    return { controller, changes };
  }

  it('opens on hover only after the delay, and closes on leave', () => {
    const { controller, changes } = make();
    controller.hoverStart('a');
    vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS - 1);
    expect(controller.current).toBeNull();
    vi.advanceTimersByTime(1);
    expect(controller.current).toBe('a');
    controller.hoverEnd('a');
    expect(changes).toEqual(['a', null]);
  });

  it('never opens for a pointer that just passes over', () => {
    const { controller } = make();
    controller.hoverStart('a');
    vi.advanceTimersByTime(100);
    controller.hoverEnd('a');
    vi.advanceTimersByTime(1000);
    expect(controller.current).toBeNull();
  });

  it('moves at once to the next button while one shows, and only right after', () => {
    const { controller } = make();
    controller.hoverStart('a');
    vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS);
    // Moving along the toolbar: leave `a`, enter `b` straight away.
    controller.hoverEnd('a');
    expect(controller.current).toBeNull();
    controller.hoverStart('b');
    expect(controller.current).toBe('b');
    // After a pause off the toolbar, the delay applies again.
    controller.hoverEnd('b');
    vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS);
    controller.hoverStart('a');
    expect(controller.current).toBeNull();
    vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS);
    expect(controller.current).toBe('a');
  });

  it('opens at once on keyboard focus and closes on blur', () => {
    const { controller } = make();
    controller.focus('a');
    expect(controller.current).toBe('a');
    controller.hoverEnd('a');
    expect(controller.current).toBe('a');
    controller.blur('a');
    expect(controller.current).toBeNull();
  });

  it('opens on a long press, swallows the click that ends it, then lingers', () => {
    const { controller } = make();
    controller.pressStart('a');
    vi.advanceTimersByTime(TOOLTIP_LONG_PRESS_MS);
    expect(controller.current).toBe('a');
    controller.pressEnd('a');
    expect(controller.consumeClick('a')).toBe(true);
    expect(controller.consumeClick('a')).toBe(false);
    vi.advanceTimersByTime(TOOLTIP_LINGER_MS);
    expect(controller.current).toBeNull();
  });

  it('lets a short tap press the button', () => {
    const { controller } = make();
    controller.pressStart('a');
    vi.advanceTimersByTime(TOOLTIP_LONG_PRESS_MS - 100);
    controller.pressEnd('a');
    vi.advanceTimersByTime(1000);
    expect(controller.current).toBeNull();
    expect(controller.consumeClick('a')).toBe(false);
  });

  it('closes on Escape, and Escape is only the tooltip’s while it shows', () => {
    const { controller } = make();
    expect(controller.escape()).toBe(false);
    controller.focus('a');
    expect(controller.escape()).toBe(true);
    expect(controller.current).toBeNull();
  });

  it('never shows while suppressed (laser, blackout, print)', () => {
    const { controller } = make(true);
    controller.focus('a');
    controller.hoverStart('a');
    vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS);
    controller.pressStart('a');
    vi.advanceTimersByTime(TOOLTIP_LONG_PRESS_MS);
    expect(controller.current).toBeNull();
  });
});

describe('ChromeTooltip in a toolbar', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const pointer = (type: string, pointerType: string) =>
    new PointerEvent(type, {
      bubbles: type !== 'pointerenter' && type !== 'pointerleave',
      pointerType,
    });

  function mount(suppressed = () => false) {
    const onaction = vi.fn();
    render(TooltipHarness, { props: { onaction, suppressed } });
    const fullscreen = screen.getByRole('button', { name: 'Full screen' });
    const laser = screen.getByRole('button', { name: 'Laser pointer' });
    return { onaction, fullscreen, laser };
  }

  it('is one instance moved between buttons, described by its visible text', async () => {
    const { fullscreen, laser } = mount();
    await fireEvent(fullscreen, pointer('pointerenter', 'mouse'));
    vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS);
    flushSync();
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toContain('Full screen');
    expect(tip.textContent).toContain(deckControlFor('fullscreen').description);
    expect(tip.textContent).toContain('Press F.');
    // The button is described by the tooltip, and the tooltip's text is on screen.
    expect(fullscreen.getAttribute('aria-describedby')).toBe(tip.id);
    expect(document.getElementById(tip.id)).toBe(tip);

    await fireEvent(fullscreen, pointer('pointerleave', 'mouse'));
    await fireEvent(laser, pointer('pointerenter', 'mouse'));
    vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS);
    flushSync();
    expect(screen.getAllByRole('tooltip')).toHaveLength(1);
    expect(screen.getByRole('tooltip').textContent).toContain('Laser pointer');
    expect(fullscreen.hasAttribute('aria-describedby')).toBe(false);
    expect(laser.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);
  });

  it('opens at once on keyboard focus', async () => {
    const { laser } = mount();
    laser.focus();
    flushSync();
    expect(screen.getByRole('tooltip').textContent).toContain('Press L. Esc closes it.');
  });

  it('closes on Escape without leaving full screen or closing the help dialog', async () => {
    const { fullscreen } = mount();
    // The deck (and the help dialog) listen for Escape on the page.
    const deckEscape = vi.fn();
    window.addEventListener('keydown', deckEscape);
    fullscreen.focus();
    flushSync();
    expect(screen.queryByRole('tooltip')).not.toBeNull();
    await fireEvent.keyDown(fullscreen, { key: 'Escape' });
    flushSync();
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(deckEscape).not.toHaveBeenCalled();
    expect(fullscreen.hasAttribute('aria-describedby')).toBe(false);
    // With no tooltip open, Escape goes to the deck as before.
    await fireEvent.keyDown(fullscreen, { key: 'Escape' });
    expect(deckEscape).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', deckEscape);
  });

  it('shows on a long press and does not press the button', async () => {
    const { onaction, laser } = mount();
    await fireEvent(laser, pointer('pointerdown', 'touch'));
    vi.advanceTimersByTime(TOOLTIP_LONG_PRESS_MS);
    flushSync();
    expect(screen.getByRole('tooltip').textContent).toContain('Laser pointer');
    await fireEvent(laser, pointer('pointerup', 'touch'));
    await fireEvent.click(laser);
    expect(onaction).not.toHaveBeenCalled();
    // A normal tap afterwards presses it.
    await fireEvent.click(laser);
    expect(onaction).toHaveBeenCalledWith('laser');
  });

  it('stays hidden while suppressed', async () => {
    const { laser } = mount(() => true);
    laser.focus();
    await fireEvent(laser, pointer('pointerenter', 'mouse'));
    vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS);
    flushSync();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
