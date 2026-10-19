import { parseInput, ValidationError } from '@protoyard/core';
import { z } from 'zod';
import { REACTIONS } from '../database/schema.ts';

/**
 * Input schemas for every service. Field errors come from core
 * `ValidationError.issues` (path → first message) so forms can render them
 * inline; `runService` leaves these errors to the form instead of toasting them.
 */

export { parseInput, ValidationError };
export const parse = parseInput;

export const MAX_POST_LENGTH = 500;
export const MAX_COMMENT_LENGTH = 300;

/** Plain text: trimmed, with runs of blank lines collapsed; never HTML. */
const text = (max: number, empty: string) =>
  z
    .string()
    .transform((s) =>
      s
        .replace(/\r\n?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    )
    .pipe(z.string().min(1, empty).max(max, `Keep it under ${max} characters`));

export const PostInputSchema = z.object({
  text: text(MAX_POST_LENGTH, 'Write something first'),
  /** Attach a generated placeholder image (the prototype never uploads files). */
  withImage: z.boolean().default(false),
});
export type PostInput = z.input<typeof PostInputSchema>;

export const CommentInputSchema = z.object({
  text: text(MAX_COMMENT_LENGTH, 'Write a comment first'),
});
export type CommentInput = z.input<typeof CommentInputSchema>;

export const ReactionKindSchema = z.enum(REACTIONS, 'Pick a reaction');
