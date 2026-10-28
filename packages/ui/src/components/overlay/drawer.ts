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
