import {
  DEVICE_IDS as CORE_DEVICE_IDS,
  DEVICES as CORE_DEVICES,
  type DeviceId as CoreDeviceId,
  fitScale as coreFitScale,
  type DeviceSpec,
  defaultDeviceFor,
  getDevice,
  type Orientation,
  orient,
  type Platform,
  type ResolvedShell,
  resolveShell,
  type ViewportPreset,
} from '@protoyard/core';

/**
 * Gallery device picker: the @protoyard/core catalog plus a free-form custom size.
 * Legacy viewport ids (`iphone`, `android`, …) still resolve for old URLs and
 * registry `preview.viewport` defaults.
 */
export type DeviceId = CoreDeviceId | 'custom';

export type { DeviceSpec, Orientation, ResolvedShell, ViewportPreset };

export const DEVICE_IDS: readonly DeviceId[] = [...CORE_DEVICE_IDS, 'custom'];

/** Catalog entries shown in the picker (core order). */
export const DEVICES: readonly DeviceSpec[] = CORE_DEVICES;

export const CUSTOM_LIMITS = { min: 240, max: 3840 };

export function clampDimension(value: number): number {
  if (!Number.isFinite(value)) return CUSTOM_LIMITS.min;
  return Math.round(Math.min(CUSTOM_LIMITS.max, Math.max(CUSTOM_LIMITS.min, value)));
}

/** Scale that fits a device frame into the available width (never upscales). */
export function fitScale(available: number, width: number): number {
  return coreFitScale(available, width);
}

/** Only http(s) URLs may be framed. */
export function safePreviewUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const VIEWPORT_ALIASES: Record<string, CoreDeviceId> = {
  desktop: 'laptop-window',
  tablet: 'tablet',
  iphone: 'phone-pill',
  android: 'phone-punch-hole',
  custom: 'laptop-window',
};

/** True when the id is a core catalog device (not free-form custom). */
export function isCatalogDeviceId(id: string): id is CoreDeviceId {
  return (CORE_DEVICE_IDS as readonly string[]).includes(id);
}

/**
 * Map a registry viewport, shell, optional device id, and platform to a catalog
 * device. Prefers an explicit device id when it fits the shell.
 */
export function defaultGalleryDevice(input: {
  viewport?: ViewportPreset | string | null;
  shell?: ResolvedShell | string | null;
  device?: string | null;
  platform?: Platform | string | null;
}): CoreDeviceId {
  const platform = (input.platform as Platform | undefined) ?? 'responsive';
  const viewport = (input.viewport as ViewportPreset | undefined) ?? 'desktop';
  const shellRaw = input.shell ?? 'auto';
  const shell =
    shellRaw === 'auto' || !shellRaw
      ? resolveShell('auto', platform)
      : resolveShell(shellRaw as 'auto' | ResolvedShell, platform);

  if (input.device && isCatalogDeviceId(input.device)) {
    return input.device;
  }
  if (viewport && VIEWPORT_ALIASES[viewport]) {
    // Honor viewport aliases when shell is none/auto-derived desktop.
    const fromViewport = VIEWPORT_ALIASES[viewport];
    if (shell === 'none' || shell === 'phone' || shell === 'tablet') {
      return defaultDeviceFor(shell === 'none' ? 'none' : shell, viewport);
    }
    if (fromViewport) return fromViewport;
  }
  return defaultDeviceFor(shell, viewport);
}

/** Normalize picker / URL values (including legacy viewport ids) to a DeviceId. */
export function normalizeDeviceId(
  id: string | null | undefined,
  fallback: DeviceId = 'laptop-window'
): DeviceId {
  if (!id) return fallback;
  if (id === 'custom') return 'custom';
  if (isCatalogDeviceId(id)) return id;
  if (VIEWPORT_ALIASES[id]) return VIEWPORT_ALIASES[id];
  return fallback;
}

export interface FrameSize {
  id: DeviceId;
  label: string;
  width: number;
  height: number;
  /** Catalog spec when not custom; drives bezel chrome. */
  spec: DeviceSpec | null;
  orientation: Orientation;
  /** Phone/tablet bezels get the premium chrome. */
  framed: boolean;
}

/** Resolved frame size for the picker selection (optionally rotated). */
export function frameFor(
  id: DeviceId,
  options: { customWidth?: number; customHeight?: number; orientation?: Orientation } = {}
): FrameSize {
  if (id === 'custom') {
    const width = clampDimension(options.customWidth ?? 1024);
    const height = clampDimension(options.customHeight ?? 768);
    return {
      id: 'custom',
      label: 'Custom',
      width,
      height,
      spec: null,
      orientation: width >= height ? 'landscape' : 'portrait',
      framed: false,
    };
  }
  const base = getDevice(id);
  if (!base) {
    return frameFor('laptop-window', options);
  }
  const orientation = options.orientation ?? base.orientation;
  const spec = orient(base, orientation);
  return {
    id,
    label: spec.label,
    width: spec.width,
    height: spec.height,
    spec,
    orientation: spec.orientation,
    framed: spec.kind === 'phone' || spec.kind === 'tablet',
  };
}

/**
 * Append `shell=none` so the prototype does not draw a second device frame
 * inside the gallery bezel (iframe is already embedded → renderer full-bleed,
 * but an override is still set so DevTools/share links stay honest).
 */
export function withGalleryShellNone(href: string): string {
  try {
    const absolute = /^https?:/i.test(href);
    const url = new URL(href, 'http://protoyard.gallery.local');
    url.searchParams.set('shell', 'none');
    return absolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}
