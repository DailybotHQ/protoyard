/** The edge a Drawer slides in from. */
export type DrawerPlacement = 'right' | 'left' | 'top' | 'bottom';

export const DRAWER_PLACEMENTS: readonly DrawerPlacement[] = ['right', 'left', 'top', 'bottom'];

/** Width for side drawers, height for top and bottom drawers. */
export const DEFAULT_DRAWER_SIZE: Record<DrawerPlacement, string> = {
  right: '24rem',
  left: '24rem',
  top: 'auto',
  bottom: 'auto',
};

/** A single CSS length; anything else (calc, var, stray `;`) falls back to the default. */
const LENGTH = /^(?:auto|0|\d{1,4}(?:\.\d{1,3})?(?:px|rem|em|ch|%|vw|vh|dvw|dvh|svw|svh))$/;

export function isDrawerPlacement(value: unknown): value is DrawerPlacement {
  return typeof value === 'string' && (DRAWER_PLACEMENTS as readonly string[]).includes(value);
}

export function isVerticalPlacement(placement: DrawerPlacement): boolean {
  return placement === 'top' || placement === 'bottom';
}

/**
 * The drawer size as a safe CSS length. Numbers are pixels; strings must be a
 * single plain length, so a size never injects other declarations into the
 * inline style.
 */
export function resolveDrawerSize(placement: DrawerPlacement, size?: string | number): string {
  if (typeof size === 'number') {
    return Number.isFinite(size) && size >= 0
      ? `${Math.round(size)}px`
      : DEFAULT_DRAWER_SIZE[placement];
  }
  const trimmed = size?.trim();
  return trimmed && LENGTH.test(trimmed) ? trimmed : DEFAULT_DRAWER_SIZE[placement];
}

const PLACEMENT_CLASSES: Record<DrawerPlacement, string> = {
  right:
    'inset-y-0 right-0 h-full w-[var(--ui-drawer-size)] max-w-full border-l pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
  left: 'inset-y-0 left-0 h-full w-[var(--ui-drawer-size)] max-w-full border-r pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
  top: 'inset-x-0 top-0 h-[var(--ui-drawer-size)] max-h-[85%] w-full rounded-b-xl border-b pt-[env(safe-area-inset-top)]',
  bottom:
    'inset-x-0 bottom-0 h-[var(--ui-drawer-size)] max-h-[85%] w-full rounded-t-xl border-t pb-[env(safe-area-inset-bottom)]',
};

/** Position and edge classes for a placement (layout only; surface styling lives in Drawer). */
export function drawerPlacementClasses(placement: DrawerPlacement): string {
  return PLACEMENT_CLASSES[placement];
}
