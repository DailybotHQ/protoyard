import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkSlug } from '@protoyard/core';
import { z } from 'zod';
import { sha256Text } from '../checksum.ts';
import { CliError } from '../output.ts';
import { assertNoSecretLikeKeys } from '../publish-ledger.ts';
import { writeJsonAtomic } from '../registry.ts';

/**
 * `quick.json`: the metadata every exploration folder carries (ADR-031). It
 * records hashes and paths, not content: the brief text is kept only when the
 * user lets it (`--no-store-brief` leaves just its sha256), and the blueprint
 * lives next to it as `blueprint.json`. The file is read back from disk, so
 * it is untrusted input: size-capped, strict, and refused when it was written
 * by a newer format version.
 */

export const QUICK_FORMAT = 'protoyard.quick';
export const QUICK_FORMAT_VERSION = 1;
export const QUICK_FILE = 'quick.json';
/** Hard cap on quick.json; a real record is a few KB. */
export const QUICK_FILE_MAX_BYTES = 256 * 1024;
/** Same cap as brief files read by `blueprint new --from-brief`. */
export const QUICK_BRIEF_MAX_CHARS = 64 * 1024;
export const QUICK_MAX_VARIANTS = 8;

const ARTIFACT_URL = /^https:\/\/claude\.ai\/(code\/)?artifact\/[A-Za-z0-9-]+$/;
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const Timestamp = z.iso.datetime({ offset: true });
const Slug = z.string().refine((value) => checkSlug(value).ok, 'Not a valid slug.');
const VariantId = z.string().regex(/^v[1-8]$/);
const PlayerVersion = z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,6}(?:-[0-9A-Za-z.-]{1,32})?$/);
/** A POSIX path relative to the exploration folder, never escaping it. */
const RelativePath = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (path) =>
      !path.startsWith('/') &&
      !path.includes('\\') &&
      !path.includes('\0') &&
      path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    'Must be a relative path inside the exploration folder.'
  );

const BriefSchema = z
  .object({
    sha256: Sha256,
    chars: z.number().int().nonnegative(),
    /** null when the brief was not stored (`--no-store-brief`). */
    text: z.string().max(QUICK_BRIEF_MAX_CHARS).nullable(),
  })
  .strict();

const VariantSchema = z
  .object({
    id: VariantId,
    label: z.string().min(1).max(160),
    dir: RelativePath,
    blueprintSha256: Sha256,
  })
  .strict();

const ScreenshotSchema = z
  .object({
    /** null for the base exploration, otherwise the variant id. */
    variant: VariantId.nullable(),
    path: RelativePath.refine((path) => path.endsWith('.png'), 'Screenshots are PNG files.'),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    bytes: z.number().int().nonnegative(),
    sha256: Sha256,
    capturedAt: Timestamp,
  })
  .strict();

const ScreenshotsSchema = z
  .object({
    files: z.array(ScreenshotSchema).max(64),
    /** A recorded skip is not a failure (a missing browser is recorded, not failed). */
    skipped: z
      .object({
        reason: z.enum(['playwright-unavailable', 'browser-unavailable', 'capture-failed']),
        at: Timestamp,
      })
      .strict()
      .nullable(),
  })
  .strict();

const ShareSchema = z
  .object({
    kind: z.literal('artifact'),
    url: z.string().regex(ARTIFACT_URL),
    visibility: z.literal('private'),
    variant: VariantId.nullable(),
    sha256: Sha256,
    at: Timestamp,
  })
  .strict();

const PromotionSchema = z
  .object({
    slug: Slug,
    variant: VariantId.nullable(),
    at: Timestamp,
  })
  .strict();

export const QuickRecordSchema = z
  .object({
    format: z.literal(QUICK_FORMAT),
    formatVersion: z.literal(QUICK_FORMAT_VERSION),
    slug: Slug,
    source: z.enum(['brief', 'blueprint']),
    /** null when the exploration started from a blueprint file. */
    brief: BriefSchema.nullable(),
    blueprintSha256: Sha256,
    seed: z.string().min(1).max(64).nullable(),
    player: z.object({ version: PlayerVersion, standalone: z.boolean() }).strict(),
    createdAt: Timestamp,
    updatedAt: Timestamp,
    variants: z.array(VariantSchema).max(QUICK_MAX_VARIANTS),
    screenshots: ScreenshotsSchema,
    shares: z.array(ShareSchema).max(256),
    promotedTo: PromotionSchema.nullable(),
  })
  .strict()
  .superRefine((record, ctx) => {
    const ids = record.variants.map((variant) => variant.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Variant ids must be unique.' });
    const known = new Set(ids);
    const refs: { path: (string | number)[]; variant: string | null }[] = [
      ...record.screenshots.files.map((shot, i) => ({
        path: ['screenshots', 'files', i],
        variant: shot.variant,
      })),
      ...record.shares.map((share, i) => ({ path: ['shares', i], variant: share.variant })),
      { path: ['promotedTo'], variant: record.promotedTo?.variant ?? null },
    ];
    for (const { path, variant } of refs) {
      if (variant !== null && !known.has(variant))
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'variant'],
          message: `Unknown variant ${variant}.`,
        });
    }
    if (record.source === 'brief' && record.brief === null)
      ctx.addIssue({
        code: 'custom',
        path: ['brief'],
        message: 'A brief exploration records its brief hash.',
      });
  });

export type QuickRecord = z.infer<typeof QuickRecordSchema>;
export type QuickVariant = z.infer<typeof VariantSchema>;
export type QuickScreenshot = z.infer<typeof ScreenshotSchema>;
export type QuickShare = z.infer<typeof ShareSchema>;

export interface CreateQuickRecordInput {
  slug: string;
  /** The brief as given; omit for an exploration started from a blueprint. */
  brief?: string;
  /** false for `--no-store-brief`: keep only the hash and length. */
  storeBrief?: boolean;
  blueprintSha256: string;
  seed?: string | null;
  player: { version: string; standalone: boolean };
  /** Injectable clock; tests pass a fixed date. */
  now?: () => Date;
}

/** A new, valid record with no variants, screenshots, shares or promotion yet. */
export function createQuickRecord(input: CreateQuickRecordInput): QuickRecord {
  const at = (input.now ?? (() => new Date()))().toISOString();
  const brief =
    input.brief === undefined
      ? null
      : {
          sha256: sha256Text(input.brief),
          chars: input.brief.length,
          text: input.storeBrief === false ? null : input.brief,
        };
  return parseQuickRecord({
    format: QUICK_FORMAT,
    formatVersion: QUICK_FORMAT_VERSION,
    slug: input.slug,
    source: brief === null ? 'blueprint' : 'brief',
    brief,
    blueprintSha256: input.blueprintSha256,
    seed: input.seed ?? null,
    player: input.player,
    createdAt: at,
    updatedAt: at,
    variants: [],
    screenshots: { files: [], skipped: null },
    shares: [],
    promotedTo: null,
  });
}

/** Validates a parsed quick.json value, or throws a `validation` CliError. */
export function parseQuickRecord(value: unknown): QuickRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('it is not a JSON object.');
  const raw = value as Record<string, unknown>;
  if (raw.format !== QUICK_FORMAT) throw invalid(`its format is not "${QUICK_FORMAT}".`);
  const version = raw.formatVersion;
  if (typeof version === 'number' && Number.isInteger(version) && version > QUICK_FORMAT_VERSION) {
    throw new CliError(
      'validation',
      `${QUICK_FILE} uses format version ${version}; this Protoyard reads version ${QUICK_FORMAT_VERSION}.`,
      { hint: 'Upgrade Protoyard to open this exploration.' }
    );
  }
  try {
    assertNoSecretLikeKeys(value);
  } catch (error) {
    throw invalid((error as Error).message);
  }
  const parsed = QuickRecordSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    throw invalid(`${where}${issue?.message ?? 'invalid record'}.`);
  }
  return parsed.data;
}

/** Reads `<dir>/quick.json`: a regular file under the size cap, then strict validation. */
export async function readQuickRecord(dir: string): Promise<QuickRecord> {
  const path = join(dir, QUICK_FILE);
  let info: Awaited<ReturnType<typeof lstat>>;
  try {
    info = await lstat(path);
  } catch {
    throw new CliError('not_found', `No ${QUICK_FILE} in ${dir}.`, {
      hint: 'Is this a folder `protoyard quick` created?',
    });
  }
  if (!info.isFile()) throw invalid('it is not a regular file.');
  if (info.size > QUICK_FILE_MAX_BYTES)
    throw invalid(`it is ${info.size} bytes; the limit is ${QUICK_FILE_MAX_BYTES}.`);
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw invalid('it is not valid JSON.');
  }
  return parseQuickRecord(value);
}

/** Validates, then writes `<dir>/quick.json` atomically. Returns the written record. */
export async function writeQuickRecord(dir: string, record: QuickRecord): Promise<QuickRecord> {
  const valid = parseQuickRecord(record);
  await writeJsonAtomic(join(dir, QUICK_FILE), valid);
  return valid;
}

/** The same record with `updatedAt` moved to now, for callers that change it. */
export function touchQuickRecord(
  record: QuickRecord,
  now: () => Date = () => new Date()
): QuickRecord {
  return { ...record, updatedAt: now().toISOString() };
}

function invalid(why: string): CliError {
  return new CliError('validation', `Invalid ${QUICK_FILE}: ${why}`, {
    hint: 'Recreate the exploration with `protoyard quick`, or fix the file by hand.',
  });
}
