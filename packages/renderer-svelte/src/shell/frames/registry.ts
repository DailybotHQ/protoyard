import { type DeviceSpec, fitScale, type ResolvedShell } from '@protoyard/core';
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
}

export type FrameComponent = Component<FrameProps>;

export interface FrameEntry {
  /** Lazy chunk: frames never load unless a prototype is shown in that shell. */
  load: () => Promise<{ default: FrameComponent }>;
  /** Space the decoration needs outside the screen on each side, in CSS px (fit scaling). */
  margin: number;
}

/**
 * Shells with a frame. A shell without an entry renders full-bleed until its
 * frame ships; the runtime still reports it as the effective shell.
 */
export const FRAMES: Partial<Record<ResolvedShell, FrameEntry>> = {
  phone: { load: () => import('./DeviceFrame.svelte'), margin: 14 },
  tablet: { load: () => import('./DeviceFrame.svelte'), margin: 14 },
};

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
 * a window narrower than the device (a real phone), or no frame yet.
 */
export function activeFrame(input: FrameDecisionInput): ResolvedShell {
  const { shell, spec, windowWidth, embedded } = input;
  if (shell === 'none' || embedded || !spec || !FRAMES[shell]) return 'none';
  return windowWidth < spec.width ? 'none' : shell;
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
