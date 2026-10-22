import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDevice, type PrototypeRuntime, parseManifest } from '@protoyard/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPrototype } from '../src/index.ts';
import {
  BADGE_CORNERS,
  COMPACT_INSET,
  COMPACT_SIZE,
  compactSpots,
  cornerRect,
  everyCornerBlocked,
  pickCorner,
  placeBadge,
  placeCompact,
  samplePoints,
  spotCost,
} from '../src/shell/badge-placement.ts';
import DemoBadge from '../src/shell/DemoBadge.svelte';
import {
  clearFrameReturn,
  frameReturnKey,
  frameToRestore,
  isFrameExitKey,
  loadFrameReturn,
  saveFrameReturn,
  withoutFramelessParams,
} from '../src/shell/frame-mode.ts';
import {
  FRAMES,
  frameBox,
  SHELL_CSS_MARKER,
  STAGE_GUTTER,
  stageScale,
} from '../src/shell/frames/registry.ts';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';
import ProbeApp from './fixtures/ProbeApp.svelte';

const laptop = getDevice('laptop-window');
const phone = getDevice('phone-pill');
if (!laptop || !phone) throw new Error('catalog devices missing');

const browser = FRAMES.browser;
const desktop = FRAMES['desktop-window'];
if (!browser || !desktop) throw new Error('window frames missing');

beforeEach(() => {
  document.documentElement.style.setProperty(SHELL_CSS_MARKER, '1');
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

describe('fluid window frames (frameBox)', () => {
  const room = (margin: number) => 2 * (margin + STAGE_GUTTER);

  it('browser and desktop window are fluid; device and panel frames are not', () => {
    expect(browser.fluid).toBe(true);
    expect(desktop.fluid).toBe(true);
    for (const shell of [
      'phone',
      'tablet',
      'widget-host',
      'side-panel',
      'extension-popup',
    ] as const) {
      expect(FRAMES[shell]?.fluid, shell).toBeFalsy();
    }
  });

  it('fills a large stage minus the frame margin and gutter, unscaled', () => {
    const stage = { width: 1920, height: 1040 };
    const box = frameBox(stage, laptop, browser);
    expect(box).toEqual({
      width: 1920 - room(browser.margin),
      height: 1040 - room(browser.margin),
      radius: laptop.cornerRadius,
      scale: 1,
    });
    // The 1920 px screenshot case: the window spans well over 85% of the width.
    expect(box.width / stage.width).toBeGreaterThan(0.9);
    const window = frameBox(stage, laptop, desktop);
    expect(window.width).toBe(1920 - room(desktop.margin));
    expect(window.scale).toBe(1);
  });

  it('never goes below the catalog size: a smaller stage scales the catalog box down', () => {
    const stage = { width: 1000, height: 700 };
    const box = frameBox(stage, laptop, browser);
    expect(box.width).toBe(laptop.width);
    expect(box.height).toBe(laptop.height);
    expect(box.scale).toBeLessThan(1);
    expect(box.scale).toBeCloseTo(stageScale(stage, laptop, browser.margin), 6);
    // Scaled box plus margins fits the stage on both axes.
    expect((box.width + room(browser.margin)) * box.scale).toBeLessThanOrEqual(stage.width + 0.01);
    expect((box.height + room(browser.margin)) * box.scale).toBeLessThanOrEqual(
      stage.height + 0.01
    );
  });

  it('grows on the roomy axis and keeps the minimum on the short one', () => {
    const box = frameBox({ width: 1920, height: 820 }, laptop, browser);
    expect(box.width).toBe(1920 - room(browser.margin));
    expect(box.height).toBe(laptop.height);
    expect(box.scale).toBeLessThan(1);
  });

  it('keeps device frames at the catalog size, scaled to fit, never up', () => {
    const entry = FRAMES.phone;
    if (!entry) throw new Error('phone frame missing');
    expect(frameBox({ width: 1920, height: 1040 }, phone, entry)).toMatchObject({
      width: phone.width,
      height: phone.height,
      scale: 1,
    });
    expect(frameBox({ width: 1440, height: 800 }, phone, entry).scale).toBeLessThan(1);
  });

  it('fills the whole stage when maximized and uses the catalog size before measuring', () => {
    expect(frameBox({ width: 1500, height: 900 }, laptop, desktop, true)).toEqual({
      width: 1500,
      height: 900,
      radius: 0,
      scale: 1,
    });
    expect(frameBox({ width: 0, height: 0 }, laptop, browser)).toEqual({
      width: laptop.width,
      height: laptop.height,
      radius: laptop.cornerRadius,
      scale: 1,
    });
  });

  it('leaves room for the full-screen control beside every frame', () => {
    for (const [shell, entry] of Object.entries(FRAMES)) {
      // bezel + 8 px gap + 32 px button fits in the margin above the frame.
      expect((entry?.bezel ?? 0) + 8 + 32, shell).toBeLessThanOrEqual(entry?.margin ?? 0);
    }
  });
});

describe('full screen state helpers', () => {
  it('remembers the shell override to return to, per prototype namespace', () => {
    saveFrameReturn('alpha', 'phone');
    saveFrameReturn('beta', undefined);
    expect(localStorage.getItem(frameReturnKey('alpha'))).toBe('phone');
    expect(loadFrameReturn('alpha')).toBe('phone');
    // No override before full screen: going back clears the override.
    expect(loadFrameReturn('beta')).toBeUndefined();
    expect(loadFrameReturn('gamma')).toBeUndefined();
    localStorage.setItem(frameReturnKey('delta'), 'watch');
    expect(loadFrameReturn('delta')).toBeUndefined();
    clearFrameReturn('alpha');
    expect(loadFrameReturn('alpha')).toBeUndefined();
  });

  it('survives storage that throws (private mode, quota)', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(() => saveFrameReturn('x', 'phone', broken)).not.toThrow();
    expect(loadFrameReturn('x', broken)).toBeUndefined();
    expect(() => clearFrameReturn('x', broken)).not.toThrow();
  });

  it('drops only the frameless link parameters from an address', () => {
    expect(withoutFramelessParams('/p/nova/app/?scenario=a&frame=none#/settings')).toBe(
      '/p/nova/app/?scenario=a#/settings'
    );
    expect(withoutFramelessParams('https://x.example/?shell=none&mode=dark')).toBe(
      'https://x.example/?mode=dark'
    );
    expect(withoutFramelessParams('/?shell=phone')).toBe('/?shell=phone');
  });

  it('leaves full screen on a plain Escape only', () => {
    const key = (init: KeyboardEventInit, target?: Element) => {
      const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, ...init });
      if (target) Object.defineProperty(event, 'target', { value: target });
      return event;
    };
    expect(isFrameExitKey(key({}))).toBe(true);
    expect(isFrameExitKey(key({ key: 'Enter' }))).toBe(false);
    expect(isFrameExitKey(key({ shiftKey: true }))).toBe(false);
    const handled = key({});
    handled.preventDefault();
    expect(isFrameExitKey(handled)).toBe(false);
    // Escape in a field belongs to the field.
    const input = document.body.appendChild(document.createElement('input'));
    expect(isFrameExitKey(key({}, input))).toBe(false);
    input.remove();
    // Escape closes an open dialog or menu first.
    const dialog = document.body.appendChild(document.createElement('div'));
    dialog.setAttribute('role', 'dialog');
    expect(isFrameExitKey(key({}))).toBe(false);
    // A collapsed panel that stays mounted (inert) does not own Escape.
    dialog.setAttribute('inert', '');
    expect(isFrameExitKey(key({}))).toBe(true);
    dialog.remove();
  });

  it('restores the manifest frame when nothing was remembered, and only when it would frame', () => {
    const manifest = parseManifest({
      id: 'test.nova',
      slug: 'nova',
      name: 'Nova',
      version: '0.1.0',
      storage: { namespace: 'nova', schemaVersion: 1 },
      scenarios: ['a'],
      preview: { viewport: 'desktop', shell: 'browser' },
    });
    let source: 'override' | 'default' = 'override';
    const runtime = {
      manifest,
      scenarios: { active: () => null },
      theme: { appearance: () => ({ shell: { value: 'none', source } }) },
    } as unknown as PrototypeRuntime;
    const input = { windowWidth: 1920, embedded: false, cssReady: true };
    expect(frameToRestore(runtime, input)).toBe('browser');
    saveFrameReturn('nova', 'tablet');
    expect(frameToRestore(runtime, input)).toBe('tablet');
    // Too narrow to frame, embedded, or not a full-screen override: nothing to restore.
    expect(frameToRestore(runtime, { ...input, windowWidth: 400 })).toBeUndefined();
    expect(frameToRestore(runtime, { ...input, embedded: true })).toBeUndefined();
    source = 'default';
    expect(frameToRestore(runtime, input)).toBeUndefined();
  });
});

describe('full screen toggle in ShellHost', () => {
  let destroy: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await destroy?.();
    destroy = undefined;
    document.body.replaceChildren();
  });

  async function mountWith(runtime = createFakeRuntime()) {
    const target = document.body.appendChild(document.createElement('div'));
    target.id = 'app';
    const mounted = await mountPrototype({
      definition: runtime.definition,
      App: ProbeApp,
      target,
      search: '',
      devtools: false,
      createRuntime: () => runtime,
    });
    destroy = mounted.destroy;
    return { runtime, target };
  }

  const settle = async () => {
    flushSync();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  };

  it('sizes a fluid browser frame to the measured stage', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        readonly callback: ResizeObserverCallback;
        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }
        observe() {
          this.callback(
            [{ contentRect: { width: 1920, height: 1000 } } as ResizeObserverEntry],
            this as unknown as ResizeObserver
          );
        }
        disconnect() {}
        unobserve() {}
      }
    );
    const { runtime, target } = await mountWith();
    await runtime.theme.setOverride({ shell: 'browser' });
    await settle();
    const device = target.querySelector<HTMLElement>('[data-py-shell-part="device"]');
    const margin = 2 * (browser.margin + STAGE_GUTTER);
    expect(device?.style.width).toBe(`${1920 - margin}px`);
    expect(device?.style.height).toBe(`${1000 - margin}px`);
    expect(device?.style.transform).toBe('');
    const screenEl = target.querySelector<HTMLElement>('[data-py-shell-part="screen"]');
    expect(screenEl?.style.getPropertyValue('--py-app-height')).toBe(`${1000 - margin - 88}px`);
  });

  it('switches to full-bleed and back with the button and Escape, keeping the app mounted', async () => {
    const { runtime, target } = await mountWith();
    await runtime.theme.setOverride({ shell: 'browser' });
    await settle();
    const app = screen.getByTestId('who');
    const toggle = screen.getByRole('button', { name: 'Show full screen' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    // Above the frame's top-right corner: a child of the device box, outside the screen,
    // with a visible label (not an icon only).
    expect(toggle.closest('[data-py-shell-part="screen"]')).toBeNull();
    expect(toggle.style.bottom).toBe('calc(100% + 8px)');
    expect(toggle.textContent?.trim()).toBe('Full screen');

    await fireEvent.click(toggle);
    await settle();
    expect(runtime.overrides.get().shell).toBe('none');
    expect(document.documentElement.dataset.pyShell).toBeUndefined();
    expect(target.querySelector('[data-py-frame]')).toBeNull();
    expect(localStorage.getItem(frameReturnKey('fake'))).toBe('browser');
    const exit = screen.getByRole('button', { name: 'Show in frame' });
    expect(exit.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/press Esc to show the frame/)).toBeTruthy();
    expect(screen.getByTestId('who')).toBe(app);

    await fireEvent.keyDown(window, { key: 'Escape' });
    await settle();
    expect(runtime.overrides.get().shell).toBe('browser');
    expect(document.documentElement.dataset.pyShell).toBe('browser');
    expect(localStorage.getItem(frameReturnKey('fake'))).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show in frame' })).toBeNull();
    expect(screen.getByTestId('who')).toBe(app);
  });

  it('returns with the second press, restores the previous override, and cleans the address', async () => {
    const { runtime } = await mountWith();
    await runtime.theme.setOverride({ shell: 'phone' });
    await settle();
    await fireEvent.click(screen.getByRole('button', { name: 'Show full screen' }));
    await settle();
    history.replaceState(null, '', '/?scenario=busy&frame=none#/notes');

    await fireEvent.click(screen.getByRole('button', { name: 'Show in frame' }));
    await settle();
    expect(runtime.overrides.get().shell).toBe('phone');
    expect(document.documentElement.dataset.pyShell).toBe('phone');
    expect(`${location.pathname}${location.search}${location.hash}`).toBe('/?scenario=busy#/notes');
  });

  it('persists: a remount in full screen still offers the way back to the remembered frame', async () => {
    const runtime = createFakeRuntime();
    await mountWith(runtime);
    await runtime.theme.setOverride({ shell: 'tablet' });
    await settle();
    await fireEvent.click(screen.getByRole('button', { name: 'Show full screen' }));
    await settle();
    await destroy?.();
    destroy = undefined;
    document.body.replaceChildren();

    // The runtime keeps the `none` override (stored per prototype); the frame to
    // return to comes from localStorage.
    await mountWith(runtime);
    await settle();
    expect(document.documentElement.dataset.pyShell).toBeUndefined();
    await fireEvent.keyDown(window, { key: 'Escape' });
    await settle();
    expect(runtime.overrides.get().shell).toBe('tablet');
  });

  it('ignores Escape while a dialog is open or a field has focus', async () => {
    const { runtime } = await mountWith();
    await runtime.theme.setOverride({ shell: 'browser' });
    await settle();
    await fireEvent.click(screen.getByRole('button', { name: 'Show full screen' }));
    await settle();
    const input = document.body.appendChild(document.createElement('input'));
    await fireEvent.keyDown(input, { key: 'Escape' });
    const dialog = document.body.appendChild(document.createElement('div'));
    dialog.setAttribute('role', 'dialog');
    await fireEvent.keyDown(window, { key: 'Escape' });
    await settle();
    expect(runtime.overrides.get().shell).toBe('none');
    dialog.remove();
    input.remove();
  });

  it('offers no full screen controls for a prototype without a frame', async () => {
    await mountWith();
    await settle();
    expect(screen.queryByRole('button', { name: 'Show full screen' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show in frame' })).toBeNull();
  });

  it('keeps the demo badge outside the framed screen', async () => {
    const runtime = createFakeRuntime();
    const target = document.body.appendChild(document.createElement('div'));
    const mounted = await mountPrototype({
      definition: runtime.definition,
      App: ProbeApp,
      target,
      search: '',
      devtools: false,
      demoBadge: true,
      createRuntime: () => runtime,
    });
    destroy = mounted.destroy;
    await runtime.theme.setOverride({ shell: 'browser' });
    await settle();
    const badge = screen.getByRole('complementary', { name: 'About this prototype' });
    expect(badge.closest('[data-py-shell-part]')).toBeNull();
    expect(target.contains(badge)).toBe(true);
  });
});

describe('demo badge placement (full-bleed)', () => {
  const container = { left: 0, top: 0, width: 1000, height: 600 };
  const size = { width: 170, height: 22 };

  it('computes each corner box inside the container', () => {
    expect(cornerRect('bottom-left', container, size)).toEqual({
      left: 12,
      top: 600 - 12 - 22,
      ...size,
    });
    expect(cornerRect('top-right', container, size)).toEqual({
      left: 1000 - 12 - 170,
      top: 12,
      ...size,
    });
    const points = samplePoints({ left: 0, top: 0, width: 170, height: 22 });
    expect(points.every(([x, y]) => x > 0 && x < 170 && y > 0 && y < 22)).toBe(true);
    // Dense enough to hit a 16 px icon button anywhere under the badge.
    expect(points.length).toBeGreaterThanOrEqual(12 * 3);
  });

  it('takes the first corner that covers no control, else the least covered', () => {
    expect(pickCorner(() => 0)).toBe('bottom-left');
    expect(pickCorner((c) => (c === 'top-left' ? 0 : 3))).toBe('top-left');
    expect(pickCorner((c) => (c === 'top-right' ? 1 : 5))).toBe('top-right');
    expect(BADGE_CORNERS[0]).toBe('bottom-left');
  });

  it('moves off a link in the bottom-left corner (the Nova sidebar Settings case)', () => {
    const link = document.createElement('a');
    link.href = '#/settings';
    const text = link.appendChild(document.createElement('span'));
    const plain = document.createElement('div');
    const hit = (x: number, y: number) => (x < 250 && y > 540 ? text : plain);
    expect(placeBadge(container, size, hit)).toBe('bottom-right');
  });

  it('prefers a corner without text, and covers text rather than a control', () => {
    const heading = document.createElement('p');
    heading.textContent = 'Fictional bank';
    const nav = document.createElement('button');
    const empty = document.createElement('div');
    // Controls along the bottom (a bottom nav), a title top-left, nothing top-right.
    const hit = (x: number, y: number) => (y > 500 ? nav : x < 300 ? heading : empty);
    expect(placeBadge(container, size, hit)).toBe('top-right');
    const crowded = (_x: number, y: number) => (y > 500 ? nav : heading);
    expect(placeBadge(container, size, crowded)).toBe('top-left');
  });

  it('shrinks to an info dot in the first gap when every corner holds a control', () => {
    const phone = { left: 0, top: 0, width: 390, height: 844 };
    const button = document.createElement('button');
    const plain = document.createElement('div');
    // Back and "More actions" in the header corners, a full-width tab bar at the bottom.
    const hit = (x: number, y: number) =>
      y > 784 || (y < 56 && (x < 56 || x > 334)) ? button : plain;
    expect(everyCornerBlocked(phone, size, hit)).toBe(true);
    const spot = placeCompact(phone, hit);
    expect(spot).toMatchObject({ width: COMPACT_SIZE, height: COMPACT_SIZE });
    // The bottom edge is all tab bar, so the dot lands on the top edge between the corner controls.
    expect(spot.top).toBe(COMPACT_INSET);
    expect(spot.left).toBeGreaterThanOrEqual(56);
    expect(spot.left + spot.width).toBeLessThanOrEqual(334);
    expect(spotCost(spot, hit, 6)).toBe(0);
  });

  it('keeps the full badge whenever one corner is free, and orders the dot spots corners first', () => {
    const button = document.createElement('button');
    const plain = document.createElement('div');
    const hit = (x: number) => (x < 500 ? button : plain);
    expect(everyCornerBlocked(container, size, hit)).toBe(false);
    const spots = compactSpots(container);
    expect(spots.slice(0, 4).map((s) => [s.left, s.top])).toEqual([
      [COMPACT_INSET, 600 - COMPACT_INSET - COMPACT_SIZE],
      [1000 - COMPACT_INSET - COMPACT_SIZE, 600 - COMPACT_INSET - COMPACT_SIZE],
      [COMPACT_INSET, COMPACT_INSET],
      [1000 - COMPACT_INSET - COMPACT_SIZE, COMPACT_INSET],
    ]);
    // Everything covered: the least covered spot, never undefined.
    expect(placeCompact(container, () => button)).toBeDefined();
  });

  it('keeps its right corners inside the visible right edge', () => {
    // Unit tests load no layout, so the corner class is checked at its source.
    const source = readFileSync(join(import.meta.dirname, '../src/shell/DemoBadge.svelte'), 'utf8');
    expect(source).toContain("'right-[calc(0.75rem+var(--py-fixed-right-edge,0px))]'");
    expect(source).not.toMatch(/'left-3' : 'right-3'/);
  });

  it('renders as a labelled, non-interactive landmark', () => {
    render(DemoBadge, { name: 'Nova' });
    const badge = screen.getByRole('complementary', { name: 'About this prototype' });
    expect(badge.className).toContain('pointer-events-none');
    expect(badge.getAttribute('data-py-demo-badge')).toBe('bottom-left');
  });
});
