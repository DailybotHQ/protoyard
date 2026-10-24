import { LAYOUT_REGISTRY as TEXULI_LAYOUT_REGISTRY } from 'texuli/layouts/host';
import { registerProtoyardLayouts } from './register.ts';

export type { LayoutComponent, LayoutEntry, LayoutProps } from 'texuli/layouts/host';

registerProtoyardLayouts();

/**
 * The registry LayoutHost loads from: texuli's, filled with texuli's layouts
 * and Protoyard's `rail`, `master-detail` and `docs` (see `register.ts`).
 * Each entry is a separate lazy import, so unused layouts stay out of the
 * boot path.
 */
export const LAYOUT_REGISTRY = TEXULI_LAYOUT_REGISTRY;
