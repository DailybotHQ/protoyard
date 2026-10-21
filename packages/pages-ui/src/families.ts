/**
 * Page/doc UI families, one lazy subpath each (`@protoyard/pages-ui/<family>`).
 * The root entry never imports a family, so a prototype pays only for the
 * surfaces its screens import (ADR-039).
 */
export const PAGE_UI_FAMILIES = ['page', 'doc', 'form', 'print'] as const;

export type PageUiFamily = (typeof PAGE_UI_FAMILIES)[number];
