export type DeviceId = 'desktop' | 'tablet' | 'iphone' | 'android' | 'custom';

export interface Device {
  id: DeviceId;
  label: string;
  width: number;
  height: number;
  /** Rounded "phone" bezel. */
  rounded: boolean;
}

/** Generic, brand-neutral viewport presets ("iPhone-like", not a specific model). */
export const DEVICES: readonly Device[] = [
  { id: 'desktop', label: 'Desktop', width: 1280, height: 800, rounded: false },
  { id: 'tablet', label: 'Tablet', width: 820, height: 1180, rounded: true },
  { id: 'iphone', label: 'iPhone-like', width: 393, height: 852, rounded: true },
  { id: 'android', label: 'Android-like', width: 412, height: 915, rounded: true },
  { id: 'custom', label: 'Custom', width: 1024, height: 768, rounded: false },
];

export const CUSTOM_LIMITS = { min: 240, max: 3840 };

export function clampDimension(value: number): number {
  if (!Number.isFinite(value)) return CUSTOM_LIMITS.min;
  return Math.round(Math.min(CUSTOM_LIMITS.max, Math.max(CUSTOM_LIMITS.min, value)));
}

/** Scale that fits a device frame into the available width (never upscales). */
export function fitScale(available: number, width: number): number {
  if (available <= 0) return 1;
  return Math.min(1, available / width);
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
