/**
 * The form ports (ADR-046): what a product implements so `FormBlock` and
 * `ResponsesPanel` use its own storage instead of Protoyard's form services.
 * `createFormServices` from `@protoyard/pages` is one implementation.
 */
import type { FormServices } from '@protoyard/pages';

/** `FormBlock` submits through this. */
export type FormPort = Pick<FormServices, 'submit'>;
/** `ResponsesPanel` lists, exports and clears through this. */
export type ResponsesPort = Pick<FormServices, 'list' | 'exportCsv' | 'clear'>;
export type { FormResponse, FormServices } from '@protoyard/pages';
