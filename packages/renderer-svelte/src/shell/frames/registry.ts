import {
  type DeviceSpec,
  fitScale,
  type ResolvedShell,
  type SafeAreaInsets,
  type ShellChrome,
  type ShellHostVariant,
  safeAreaOf,
} from '@protoyard/core';
import type { Component } from 'svelte';

/**
 * A frame draws a shell's decoration (bezel, status bar, window chrome…)
 * around the device screen. ShellHost owns the screen element itself (size,
 * containing block, scroll root, `--py-*` tokens), so switching frames never
 * remounts the app: a frame is a sibling overlay, positioned over the device
 * box, with `pointer-events: none` except on controls that really work.
 */
export interface FrameProps {
  /** The device in its effective orientation. */
  spec: DeviceSpec;
  /** The shell being drawn (one frame module may serve several shells). */
  shell: ResolvedShell;
  /** The manifest's `preview.chrome` (window style, origin, host…). */
  chrome?: ShellChrome | undefined;
  /*
   * Window-like frames only (ShellHost always passes them; device frames may
   * ignore them).
   */
  /** The prototype's name and icon, for docks, tabs and launchers. */
  app?: { name: string; icon?: string | undefined };
  /** Whether the host currently fills the stage with the device box. */
  maximized?: boolean;
  /** Ask the host to fill the stage (or go back to the device size). */
  setMaximized?(value: boolean): void;
  /** Hide the screen without unmounting the app (minimized or closed windows). */
  setScreenHidden?(value: boolean): void;
  /** Side-panel host override (tests); defaults to `preview.chrome.hostVariant`. */
  hostVariant?: ShellHostVariant;
}

export type FrameComponent = Component<FrameProps>;

export interface ScreenInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FrameEntry {
  /** Lazy chunk: frames never load unless a prototype is shown in that shell. */
  load: () => Promise<{ default: FrameComponent }>;
  /** Space the decoration needs outside the device box on each side, in CSS px (fit scaling). */
  margin: number;
  /**
   * Space the frame's own chrome takes INSIDE the device box (a window title
   * bar), so the app's screen starts below it. Default: none.
   */
  screenInset?: Partial<ScreenInset>;
  /**
   * Narrowest window that still shows the frame. Default: the device plus its
   * margin and gutter, so a real phone gets full-bleed. Windows set a fixed
   * minimum instead and scale down on smaller desktops.
   */
  minWindowWidth?: number;
  /**
   * Window-like frames (browser, desktop window) grow with the stage: the box
   * fills the stage minus margin and gutter, and the catalog size is only its
   * minimum (below it, the box scales down like a device). Default: false.
   */
  fluid?: boolean;
  /**
   * Decoration drawn outside the device box on each side (a bezel ring), in
   * CSS px. Controls beside the frame (rotate, full screen) start past it.
   */
  bezel?: number;
}

/**
 * Shells with a frame. A shell without an entry renders full-bleed until its
 * frame ships; the runtime still reports it as the effective shell.
 */
export const FRAMES: Partial<Record<ResolvedShell, FrameEntry>> = {
  /*
   * Margins hold the decoration plus the controls beside it (rotate, full
   * screen: an 8 px gap and a 32 px button), which never cover the screen.
   * Phone and tablet: bezel 12 / 22 px + 44.
   */
  phone: { load: () => import('./PhoneFrame.svelte'), margin: 56, bezel: 12 },
  tablet: { load: () => import('./TabletFrame.svelte'), margin: 66, bezel: 22 },
  /*
   * Panel shells draw a host page on the catalog laptop. Their 48 px margin
   * holds the full-screen control; they keep the old 1328 px threshold and
   * scale down slightly up to the 1424 px they need at full size.
   */
  'extension-popup': {
    load: () => import('./ExtensionPopupFrame.svelte'),
    margin: 48,
    minWindowWidth: 1328,
  },
  'widget-host': {
    load: () => import('./WidgetHostFrame.svelte'),
    margin: 48,
    minWindowWidth: 1328,
  },
  /* The dock or taskbar hangs 14 + 48 px below the window, inside the margin. */
  'desktop-window': {
    load: () => import('./DesktopWindowFrame.svelte'),
    margin: 64,
    screenInset: { top: 40 },
    minWindowWidth: 768,
    fluid: true,
  },
  'side-panel': {
    load: () => import('./SidePanelFrame.svelte'),
    margin: 48,
    minWindowWidth: 1328,
  },
  /*
   * Browser chrome (40 px tab strip + 48 px address bar) sits above the app's
   * screen; the margin holds the full-screen control beside the window.
   */
  browser: {
    load: () => import('./BrowserFrame.svelte'),
    margin: 48,
    screenInset: { top: 88 },
    minWindowWidth: 768,
    fluid: true,
  },
};

/** Custom property `app.css` sets on `:root`, so the host can tell the shell CSS is loaded. */
export const SHELL_CSS_MARKER = '--py-shell-css';

/**
 * True when the stylesheet carrying the shell layout rules is loaded. Without
 * those rules the stage collapses to a few pixels and the device scales to a
 * speck (a blank page), so the host renders full-bleed instead.
 */
export function hasShellCss(root: HTMLElement = document.documentElement): boolean {
  return getComputedStyle(root).getPropertyValue(SHELL_CSS_MARKER).trim() === '1';
}

/** Resolved inset of the app screen inside the device box. */
export function screenInsetOf(entry: FrameEntry | undefined): ScreenInset {
  return { top: 0, right: 0, bottom: 0, left: 0, ...entry?.screenInset };
}

/**
 * Height of the simulated status bar a device frame paints over the top of the
 * screen: the bar's own height or the top safe-area inset, whichever is taller.
 * Zero for devices without one (windows).
 */
export function statusBarHeightOf(spec: DeviceSpec): number {
  if (spec.statusBar.style === 'none') return 0;
  return Math.max(spec.statusBar.height, safeAreaOf(spec).top);
}

export interface ScreenLayout {
  /** Where the app's screen sits inside the device box. */
  inset: ScreenInset;
  /** The insets the app still has to clear itself (`--py-safe-*`). */
  safe: SafeAreaInsets;
}

/**
 * The app's screen inside a sized (device or window) shell.
 *
 * - Top: the app clears the status bar the frame paints, not only the catalog
 *   inset. A landscape phone has no top inset but still shows the bar, which
 *   used to cover the app's header.
 * - Sides: the side insets of a landscape phone (the cutout side) letterbox the
 *   screen, as a mobile browser does for a page without `viewport-fit=cover`.
 *   The app, its fixed descendants and portaled overlays fill the width between
 *   them, so the side tokens the app sees are zero. The device box paints the
 *   gutters in the app's background color.
 */
export function screenLayoutOf(spec: DeviceSpec, entry: FrameEntry | undefined): ScreenLayout {
  const chrome = screenInsetOf(entry);
  const device = safeAreaOf(spec);
  return {
    inset: {
      top: chrome.top,
      right: chrome.right + device.right,
      bottom: chrome.bottom,
      left: chrome.left + device.left,
    },
    safe: {
      top: Math.max(device.top, statusBarHeightOf(spec)),
      right: 0,
      bottom: device.bottom,
      left: 0,
    },
  };
}

/** Gap kept between the frame and the window edge, in CSS px. */
export const STAGE_GUTTER = 24;

/**
 * True inside an iframe (the gallery preview draws its own device). A
 * cross-origin parent makes `window.top` throw on access in some engines,
 * which also means "embedded".
 */
export function isEmbedded(win: Window = window): boolean {
  try {
    return win.top !== win.self;
  } catch {
    return true;
  }
}

export interface FrameDecisionInput {
  shell: ResolvedShell;
  spec: DeviceSpec | undefined;
  /** The real window width (media queries follow it). */
  windowWidth: number;
  embedded: boolean;
  /**
   * Whether the shell layout CSS (`@protoyard/renderer-svelte/app.css`) is
   * loaded. Default `true`; ShellHost passes `hasShellCss()`.
   */
  cssReady?: boolean;
}

/**
 * The shell actually framed, or `none` for full-bleed: no shell, embedded,
 * no frame yet, or a window too narrow for the device plus its frame and
 * gutter (a real phone, even one slightly wider than the catalog device).
 */
export function activeFrame(input: FrameDecisionInput): ResolvedShell {
  const { shell, spec, windowWidth, embedded, cssReady = true } = input;
  const entry = shell === 'none' ? undefined : FRAMES[shell];
  if (!entry || embedded || !spec || !cssReady) return 'none';
  const needed = entry.minWindowWidth ?? spec.width + 2 * (entry.margin + STAGE_GUTTER);
  return windowWidth < needed ? 'none' : shell;
}

/**
 * Window-control style: the manifest's `chrome.os`, else the visitor's OS
 * (Windows-like on Windows, mac-like everywhere else).
 */
export function windowVariant(
  os: ShellChrome['os'],
  platform: string = typeof navigator === 'undefined' ? '' : navigator.platform
): 'mac-like' | 'windows-like' {
  if (os === 'mac') return 'mac-like';
  if (os === 'windows') return 'windows-like';
  return /^win/i.test(platform) ? 'windows-like' : 'mac-like';
}

/** Scale that fits the device (plus its frame margin) into the stage on both axes; never upscales. */
export function stageScale(
  available: { width: number; height: number },
  spec: Pick<DeviceSpec, 'width' | 'height'>,
  margin: number
): number {
  const outerWidth = spec.width + 2 * (margin + STAGE_GUTTER);
  const outerHeight = spec.height + 2 * (margin + STAGE_GUTTER);
  return Math.min(fitScale(available.width, outerWidth), fitScale(available.height, outerHeight));
}

export interface FrameBox {
  /** Unscaled device box, in CSS px. */
  width: number;
  height: number;
  /** Corner radius of the box (0 when it fills the stage). */
  radius: number;
  /** Scale applied to the box so it fits the stage (never above 1). */
  scale: number;
}

/**
 * The device box ShellHost draws for a frame in a stage of `available` size.
 *
 * - Maximized: the whole stage, unscaled and square.
 * - Fluid frames (browser, desktop window): the stage minus margin and gutter
 *   on each side, never smaller than the catalog size; below that size the box
 *   keeps the catalog size on that axis and scales down to fit.
 * - Devices (phone, tablet, panel hosts): the catalog size, scaled down to fit.
 *
 * An unmeasured stage (0 × 0, before the first resize observation or without
 * a layout engine) gets the catalog size at scale 1.
 */
export function frameBox(
  available: { width: number; height: number },
  spec: Pick<DeviceSpec, 'width' | 'height' | 'cornerRadius'>,
  entry: Pick<FrameEntry, 'margin' | 'fluid'>,
  maximized = false
): FrameBox {
  const measured = available.width > 0 && available.height > 0;
  if (maximized && measured) {
    return {
      width: Math.floor(available.width),
      height: Math.floor(available.height),
      radius: 0,
      scale: 1,
    };
  }
  const room = 2 * (entry.margin + STAGE_GUTTER);
  const size =
    entry.fluid && measured
      ? {
          width: Math.max(spec.width, Math.floor(available.width - room)),
          height: Math.max(spec.height, Math.floor(available.height - room)),
        }
      : { width: spec.width, height: spec.height };
  return { ...size, radius: spec.cornerRadius, scale: stageScale(available, size, entry.margin) };
}
