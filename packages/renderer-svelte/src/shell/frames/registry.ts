import {
  type DeviceSpec,
  fitScale,
  type ResolvedShell,
  type ShellChrome,
  type ShellHostVariant,
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
}

/**
 * Shells with a frame. A shell without an entry renders full-bleed until its
 * frame ships; the runtime still reports it as the effective shell.
 */
export const FRAMES: Partial<Record<ResolvedShell, FrameEntry>> = {
  phone: { load: () => import('./PhoneFrame.svelte'), margin: 14 },
  tablet: { load: () => import('./DeviceFrame.svelte'), margin: 14 },
  'widget-host': { load: () => import('./WidgetHostFrame.svelte'), margin: 0 },
  'desktop-window': {
    load: () => import('./DesktopWindowFrame.svelte'),
    margin: 64,
    screenInset: { top: 40 },
    minWindowWidth: 768,
  },
  'side-panel': { load: () => import('./SidePanelFrame.svelte'), margin: 0 },
};

/** Resolved inset of the app screen inside the device box. */
export function screenInsetOf(entry: FrameEntry | undefined): ScreenInset {
  return { top: 0, right: 0, bottom: 0, left: 0, ...entry?.screenInset };
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
}

/**
 * The shell actually framed, or `none` for full-bleed: no shell, embedded,
 * no frame yet, or a window too narrow for the device plus its frame and
 * gutter (a real phone, even one slightly wider than the catalog device).
 */
export function activeFrame(input: FrameDecisionInput): ResolvedShell {
  const { shell, spec, windowWidth, embedded } = input;
  const entry = shell === 'none' ? undefined : FRAMES[shell];
  if (!entry || embedded || !spec) return 'none';
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
