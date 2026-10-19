import { z } from 'zod';
import type { Platform } from './manifest.ts';

/**
 * App layouts (ADR-023): the page frame a prototype's screens sit in
 * (sidebar, top nav, master-detail…). Data only, like the device catalog, so
 * the CLI, the gallery and DevTools can read it without rendering anything.
 *
 * `custom` means the prototype renders its own layout; it is the default, so
 * every existing prototype keeps working unchanged. A manifest opts into the
 * shared layouts with `preview.layout`, and the runtime resolves the
 * effective layout like the shell: override › scenario › manifest.
 */

export const LAYOUT_IDS = [
  'sidebar',
  'rail',
  'top-nav',
  'dual-sidebar',
  'master-detail',
  'dashboard-grid',
  'docs',
  'marketing',
  'mobile-tabs',
  'mobile-drawer',
  'wizard',
  'auth-split',
  'custom',
] as const;
export const LayoutIdSchema = z.enum(LAYOUT_IDS);
export type LayoutId = z.infer<typeof LayoutIdSchema>;

/** The prototype renders its own layout. */
export const DEFAULT_LAYOUT: LayoutId = 'custom';

/** Layout options are flat, data-only knobs read by the layout (never code). */
export const LayoutOptionsSchema = z
  .record(
    z
      .string()
      .max(40)
      .regex(/^[a-z][a-zA-Z0-9-]*$/, { message: 'option keys are camelCase or kebab-case' }),
    z.union([z.string().max(120), z.number().finite(), z.boolean()])
  )
  .refine((options) => Object.keys(options).length <= 32, {
    message: 'at most 32 layout options',
  });
export type LayoutOptions = z.infer<typeof LayoutOptionsSchema>;

/** `protoyard.json` → `preview.layout`. */
export const LayoutSettingsSchema = z
  .object({
    /** Layout the prototype opens in. */
    id: LayoutIdSchema.default(DEFAULT_LAYOUT),
    /**
     * Layouts its screens work in (DevTools offers only these). The `id` is
     * always a choice. Absent: every shared layout, or only `custom` when
     * the id is `custom`.
     */
    supported: z
      .array(LayoutIdSchema)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'duplicate layout ids' })
      .optional(),
    options: LayoutOptionsSchema.optional(),
  })
  .strict();
export type LayoutSettings = z.infer<typeof LayoutSettingsSchema>;

export interface LayoutSpec {
  readonly id: LayoutId;
  readonly label: string;
  /** Manifest platforms the layout is designed for. */
  readonly platforms: readonly Platform[];
  /** Narrowest width (CSS px) the layout works at as designed. */
  readonly minWidth: number;
  /** Layout used below `minWidth`; absent when the layout adapts itself. */
  readonly fallback?: LayoutId;
}

const WIDE: readonly Platform[] = ['desktop', 'responsive'];
const NARROW: readonly Platform[] = ['mobile', 'responsive'];
const ANY: readonly Platform[] = ['desktop', 'mobile', 'responsive'];

const spec = (
  id: LayoutId,
  label: string,
  platforms: readonly Platform[],
  minWidth = 0,
  fallback?: LayoutId
): LayoutSpec =>
  Object.freeze(
    fallback ? { id, label, platforms, minWidth, fallback } : { id, label, platforms, minWidth }
  );

/** Every layout, in picker order. Frozen. */
export const LAYOUTS: readonly LayoutSpec[] = Object.freeze([
  spec('sidebar', 'Sidebar', WIDE, 768, 'mobile-drawer'),
  spec('rail', 'Icon rail', WIDE, 640, 'mobile-tabs'),
  spec('top-nav', 'Top navigation', WIDE, 768, 'mobile-drawer'),
  spec('dual-sidebar', 'Dual sidebar', ['desktop'], 1024, 'sidebar'),
  spec('master-detail', 'Master-detail', WIDE, 900, 'mobile-drawer'),
  spec('dashboard-grid', 'Dashboard grid', WIDE, 768, 'mobile-drawer'),
  spec('docs', 'Docs', WIDE, 900, 'mobile-drawer'),
  spec('marketing', 'Marketing page', ANY),
  spec('mobile-tabs', 'Mobile tab bar', NARROW),
  spec('mobile-drawer', 'Mobile drawer', NARROW),
  spec('wizard', 'Wizard', ANY),
  spec('auth-split', 'Auth split', ANY),
  spec('custom', 'Custom', ANY),
]);

export function getLayout(id: LayoutId): LayoutSpec | undefined {
  return LAYOUTS.find((layout) => layout.id === id);
}

/**
 * Layouts a prototype can switch between: its `id` first, then `supported`
 * (or every shared layout when it declares none and is not `custom`).
 */
export function layoutChoices(settings?: Partial<LayoutSettings>): readonly LayoutId[] {
  const id = settings?.id ?? DEFAULT_LAYOUT;
  if (settings?.supported) return [id, ...settings.supported.filter((s) => s !== id)];
  if (id === 'custom') return ['custom'];
  return LAYOUT_IDS.filter((layout) => layout !== 'custom');
}

/** The layout to render at `width`, following each `fallback` below its `minWidth`. */
export function layoutForWidth(id: LayoutId, width: number): LayoutId {
  let current = id;
  for (let hops = 0; hops < LAYOUT_IDS.length; hops++) {
    const layout = getLayout(current);
    if (!layout?.fallback || width >= layout.minWidth) return current;
    current = layout.fallback;
  }
  return current;
}
