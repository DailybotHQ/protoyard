import { z } from 'zod';

/**
 * Brand-neutral device catalog: the single source of truth for device frames
 * (renderer shells), the DevTools device picker and the gallery preview.
 *
 * Entries are data only (no DOM, no framework), so the gallery can reuse them
 * while depending only on `@protoyard/core`. Labels describe a form factor
 * ("Phone (pill cutout)"), never a real device model, vendor or OS mark.
 * Sizes are CSS pixels; insets are the safe-area insets a frame feeds into
 * `--py-safe-*` for the given orientation.
 */

export const DeviceKindSchema = z.enum(['phone', 'tablet', 'laptop', 'desktop']);
export type DeviceKind = z.infer<typeof DeviceKindSchema>;

export const OrientationSchema = z.enum(['portrait', 'landscape']);
export type Orientation = z.infer<typeof OrientationSchema>;

/** Camera cutout drawn by phone and tablet frames. */
export const CutoutStyleSchema = z.enum(['none', 'pill', 'punch-hole', 'notch']);
export type CutoutStyle = z.infer<typeof CutoutStyleSchema>;

/**
 * `split`: clock and indicators sit left and right of a central cutout.
 * `standard`: clock left, indicators right, no gap. `none`: no status bar.
 */
export const StatusBarStyleSchema = z.enum(['split', 'standard', 'none']);
export type StatusBarStyle = z.infer<typeof StatusBarStyleSchema>;

const InsetSchema = z.number().int().nonnegative();

export const SafeAreaInsetsSchema = z
  .object({ top: InsetSchema, right: InsetSchema, bottom: InsetSchema, left: InsetSchema })
  .strict();
export type SafeAreaInsets = z.infer<typeof SafeAreaInsetsSchema>;

export const DEVICE_IDS = [
  'phone-pill',
  'phone-punch-hole',
  'tablet',
  'laptop-window',
  'desktop-window',
] as const;
export const DeviceIdSchema = z.enum(DEVICE_IDS);
export type DeviceId = z.infer<typeof DeviceIdSchema>;

export const DeviceSpecSchema = z
  .object({
    id: DeviceIdSchema,
    label: z.string().min(1).max(40),
    kind: DeviceKindSchema,
    /** Orientation `width`/`height` describe; `rotate()` flips it. */
    orientation: OrientationSchema,
    /** Windows (laptop, desktop) do not rotate. */
    rotatable: z.boolean(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    cornerRadius: z.number().int().nonnegative(),
    safeArea: z
      .object({ portrait: SafeAreaInsetsSchema, landscape: SafeAreaInsetsSchema })
      .strict(),
    statusBar: z.object({ height: InsetSchema, style: StatusBarStyleSchema }).strict(),
    homeIndicator: z.object({ height: InsetSchema }).strict(),
    cutout: CutoutStyleSchema,
  })
  .strict();
export type DeviceSpec = z.infer<typeof DeviceSpecSchema>;

const NO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

function freeze(spec: DeviceSpec): DeviceSpec {
  Object.freeze(spec.safeArea.portrait);
  Object.freeze(spec.safeArea.landscape);
  Object.freeze(spec.safeArea);
  Object.freeze(spec.statusBar);
  Object.freeze(spec.homeIndicator);
  return Object.freeze(spec);
}

/** Every catalog entry, in picker order. Deeply frozen. */
export const DEVICES: readonly DeviceSpec[] = Object.freeze(
  (
    [
      {
        id: 'phone-pill',
        label: 'Phone (pill cutout)',
        kind: 'phone',
        orientation: 'portrait',
        rotatable: true,
        width: 393,
        height: 852,
        cornerRadius: 55,
        safeArea: {
          portrait: { top: 59, right: 0, bottom: 34, left: 0 },
          landscape: { top: 0, right: 59, bottom: 21, left: 59 },
        },
        statusBar: { height: 54, style: 'split' },
        homeIndicator: { height: 34 },
        cutout: 'pill',
      },
      {
        id: 'phone-punch-hole',
        label: 'Phone (punch-hole)',
        kind: 'phone',
        orientation: 'portrait',
        rotatable: true,
        width: 412,
        height: 915,
        cornerRadius: 36,
        safeArea: {
          portrait: { top: 32, right: 0, bottom: 24, left: 0 },
          landscape: { top: 0, right: 0, bottom: 24, left: 32 },
        },
        statusBar: { height: 32, style: 'standard' },
        homeIndicator: { height: 24 },
        cutout: 'punch-hole',
      },
      {
        id: 'tablet',
        label: 'Tablet',
        kind: 'tablet',
        orientation: 'portrait',
        rotatable: true,
        width: 820,
        height: 1180,
        cornerRadius: 18,
        safeArea: {
          portrait: { top: 24, right: 0, bottom: 20, left: 0 },
          landscape: { top: 24, right: 0, bottom: 20, left: 0 },
        },
        statusBar: { height: 24, style: 'standard' },
        homeIndicator: { height: 20 },
        cutout: 'none',
      },
      {
        id: 'laptop-window',
        label: 'Laptop window',
        kind: 'laptop',
        orientation: 'landscape',
        rotatable: false,
        width: 1280,
        height: 800,
        cornerRadius: 10,
        safeArea: { portrait: { ...NO_INSETS }, landscape: { ...NO_INSETS } },
        statusBar: { height: 0, style: 'none' },
        homeIndicator: { height: 0 },
        cutout: 'none',
      },
      {
        id: 'desktop-window',
        label: 'Desktop window',
        kind: 'desktop',
        orientation: 'landscape',
        rotatable: false,
        width: 1440,
        height: 900,
        cornerRadius: 10,
        safeArea: { portrait: { ...NO_INSETS }, landscape: { ...NO_INSETS } },
        statusBar: { height: 0, style: 'none' },
        homeIndicator: { height: 0 },
        cutout: 'none',
      },
    ] satisfies DeviceSpec[]
  ).map(freeze)
);

/** Catalog entry by id, or `undefined` for unknown (e.g. untrusted) ids. */
export function getDevice(id: string): DeviceSpec | undefined {
  return DEVICES.find((device) => device.id === id);
}

/** Safe-area insets for the spec's current orientation. */
export function safeAreaOf(spec: DeviceSpec): SafeAreaInsets {
  return spec.safeArea[spec.orientation];
}

/**
 * Turns a device a quarter turn: swaps `width`/`height` and flips the
 * orientation, so `safeAreaOf()` returns the other orientation's insets.
 * Non-rotatable devices (windows) are returned unchanged. Never mutates.
 */
export function rotate(spec: DeviceSpec): DeviceSpec {
  if (!spec.rotatable) return spec;
  return freeze({
    ...spec,
    orientation: spec.orientation === 'portrait' ? 'landscape' : 'portrait',
    width: spec.height,
    height: spec.width,
  });
}

/** The spec in the requested orientation (unchanged when it cannot rotate). */
export function orient(spec: DeviceSpec, orientation: Orientation): DeviceSpec {
  return spec.orientation === orientation ? spec : rotate(spec);
}

/** Scale that fits a frame of `width` into `available` pixels; never upscales. */
export function fitScale(available: number, width: number): number {
  if (!(available > 0) || !(width > 0)) return 1;
  return Math.min(1, available / width);
}
