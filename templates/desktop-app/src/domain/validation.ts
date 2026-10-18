import { parseInput, ValidationError } from '@protoyard/core';
import { z } from 'zod';
import { TAG_COLORS } from '../database/schema.ts';

/**
 * Input schemas for every service. Field errors come from core
 * `ValidationError.issues` (path → first message), so dialogs and the editor
 * render them inline; `runService` leaves these errors to the form instead of
 * toasting them.
 */

export { parseInput as parse, ValidationError };

export const DOCUMENT_TITLE_MAX = 120;
export const DOCUMENT_BODY_MAX = 50_000;

export const FolderInputSchema = z.object({
  name: z.string().trim().min(1, 'Give the folder a name').max(60, 'Keep it under 60 characters'),
});
export type FolderInput = z.input<typeof FolderInputSchema>;

export const DocumentCreateSchema = z.object({
  folderId: z.string().min(1, 'Pick a folder'),
  title: z.string().trim().max(DOCUMENT_TITLE_MAX).default('Untitled'),
});
export type DocumentCreateInput = z.input<typeof DocumentCreateSchema>;

export const DocumentSaveSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Give the document a title')
    .max(DOCUMENT_TITLE_MAX, `Keep the title under ${DOCUMENT_TITLE_MAX} characters`),
  body: z.string().max(DOCUMENT_BODY_MAX, 'This document is too long for the prototype'),
  tagIds: z.array(z.string().min(1)).max(10, 'Use at most 10 tags'),
});
export type DocumentSaveInput = z.input<typeof DocumentSaveSchema>;

export const TagInputSchema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Give the tag a name')
    .max(24, 'Keep it under 24 characters')
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} -]*$/u, 'Use letters, numbers, spaces or dashes'),
  color: z.enum(TAG_COLORS).default('slate'),
});
export type TagInput = z.input<typeof TagInputSchema>;
