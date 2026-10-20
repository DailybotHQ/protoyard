import { parseInput, ValidationError } from '@protoyard/core';
import { z } from 'zod';

/**
 * Input schemas for every service. Field errors come from core
 * `ValidationError.issues` (path → first message) so forms can render them
 * inline; `runService` leaves these errors to the form instead of toasting them.
 */

export { parseInput, ValidationError };
export const parse = parseInput;

export const TITLE_MAX = 120;
export const BODY_MAX = 50_000;

const title = z
  .string()
  .trim()
  .min(1, 'Give the page a title')
  .max(TITLE_MAX, `Keep the title under ${TITLE_MAX} characters`);
/** Markdown source, stored as typed; only the safe parser ever renders it. */
const body = z
  .string()
  .max(BODY_MAX, `Keep the page under ${BODY_MAX.toLocaleString('en-US')} characters`);

export const PageCreateSchema = z.object({
  spaceId: z.string().min(1, 'Pick a space'),
  parentId: z.string().min(1).nullable().default(null),
  title,
  body: body.default(''),
});
export type PageCreateInput = z.input<typeof PageCreateSchema>;

export const PageSaveSchema = z.object({
  title,
  body,
  /** The version the editor started from; a newer stored version is a conflict. */
  baseVersion: z.number().int().min(1),
});
export type PageSaveInput = z.input<typeof PageSaveSchema>;

export const PageMoveSchema = z.object({
  parentId: z.string().min(1).nullable(),
  rank: z.string().min(1),
  rerank: z.array(z.object({ id: z.string().min(1), rank: z.string().min(1) })).optional(),
});
export type PageMoveInput = z.input<typeof PageMoveSchema>;

export const SpaceCreateSchema = z.object({
  name: z.string().trim().min(2, 'Name the space').max(60),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Use 2–10 letters or digits, starting with a letter'),
  description: z.string().trim().max(200, 'Keep it under 200 characters').default(''),
  icon: z.string().trim().min(1).max(4).default('📘'),
});
export type SpaceCreateInput = z.input<typeof SpaceCreateSchema>;
