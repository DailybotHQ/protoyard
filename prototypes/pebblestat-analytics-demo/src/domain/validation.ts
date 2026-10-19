import { DashboardLayoutSchema, filterSchemaFor } from '@protoyard/analytics';
import { parseInput, ValidationError } from '@protoyard/core';
import { z } from 'zod';
import {
  ALERT_OPERATORS,
  ANNOTATION_KINDS,
  EVENT_TYPES,
  REPORT_MEASURES,
} from '../database/schema.ts';
import { BREAKDOWN_PATHS, EVENT_CATALOG } from './catalog.ts';

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
  projectId: z.string().min(1),
  name,
  filter: filterSchemaFor(EVENT_CATALOG),
});
export type SegmentInput = z.input<typeof SegmentInputSchema>;

const eventType = z.enum(['all', ...EVENT_TYPES], 'Pick an event');

export const ReportInputSchema = z.object({
  projectId: z.string().min(1),
  name,
  config: z.object({
    eventType,
    measure: z.enum(REPORT_MEASURES),
    breakdown: z.enum(BREAKDOWN_PATHS).nullable(),
    filter: filterSchemaFor(EVENT_CATALOG),
  }),
});
export type ReportInput = z.input<typeof ReportInputSchema>;

export const AlertInputSchema = z.object({
  projectId: z.string().min(1),
  name,
  eventType: z.enum(EVENT_TYPES, 'Pick an event'),
  operator: z.enum(ALERT_OPERATORS, 'Pick above or below'),
  threshold: z.coerce
    .number('Enter a number')
    .int('Use a whole number of events')
    .min(0, 'Use zero or more')
    .max(10_000_000, 'That threshold is too large'),
});
export type AlertInput = z.input<typeof AlertInputSchema>;

export const AnnotationInputSchema = z.object({
  projectId: z.string().min(1),
  title: z
    .string()
    .trim()
    .min(2, 'Use at least 2 characters')
    .max(80, 'Keep it under 80 characters'),
  kind: z.enum(ANNOTATION_KINDS, 'Pick a kind'),
  /** `YYYY-MM-DD` (UTC). */
  day: z.iso.date('Pick a date'),
});
export type AnnotationInput = z.input<typeof AnnotationInputSchema>;
