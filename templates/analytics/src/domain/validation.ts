import { DashboardLayoutSchema, filterSchemaFor } from '@protoyard/analytics';
import { parseInput, ValidationError } from '@protoyard/core';
import { z } from 'zod';
import { EVENT_CATALOG } from './catalog.ts';

/**
 * Input schemas for every service. Field errors come from core
 * `ValidationError.issues` (path → first message) so dialogs can render them
 * inline; `runService` leaves these errors to the form instead of toasting them.
 */

export { parseInput, ValidationError };
export const parse = parseInput;

const name = z
  .string()
  .trim()
  .min(2, 'Use at least 2 characters')
  .max(60, 'Keep it under 60 characters');

export const LayoutInputSchema = z.object({ layout: DashboardLayoutSchema });
export type LayoutInput = z.input<typeof LayoutInputSchema>;

export const RenameInputSchema = z.object({ name });
export type RenameInput = z.input<typeof RenameInputSchema>;

/** Only known event properties with operators that fit their type (filterSchemaFor). */
export const SegmentInputSchema = z.object({
  name,
  filter: filterSchemaFor(EVENT_CATALOG),
});
export type SegmentInput = z.input<typeof SegmentInputSchema>;
