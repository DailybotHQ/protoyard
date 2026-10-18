import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { FileDigest } from './checksum.ts';
import { sha256Text } from './checksum.ts';
import type { WorkspacePaths } from './paths.ts';
import { run } from './process.ts';

/**
 * The local deploy ledger: one JSON line per completed publish (real, dry run
 * or static ZIP) in `artifacts/publish/ledger.jsonl` (git-ignored). The review
 * index and CI comments read it, so every URL in it is one a provider printed
 * (ADR-014). It never holds tokens, account ids or provider output.
 */
export const LEDGER_FORMAT = 'protoyard.publish-ledger';

export function ledgerPath(paths: Pick<WorkspacePaths, 'artifacts'>): string {
  return join(paths.artifacts, 'publish', 'ledger.jsonl');
}

/** Key names that could carry a credential; refused anywhere in an entry. */
const SECRET_KEY = /token|secret|password|passwd|credential|api[-_]?key|auth|cookie|account/i;

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const LedgerEntrySchema = z
  .object({
    format: z.literal(LEDGER_FORMAT),
    formatVersion: z.literal(1),
    /** ISO 8601 time the publish completed (metadata, never seeded data). */
    at: z.iso.datetime({ offset: true }),
    slug: z.string().min(1),
    provider: z.enum(['cloudflare', 'netlify', 'vercel', 'static']),
    kind: z.enum(['static', 'dry-run', 'published']),
    dryRun: z.boolean(),
    target: z.enum(['preview', 'production']),
    branch: z.string().min(1).nullable(),
    project: z.string().min(1),
    /** Only the URL the provider printed, and only for a real deploy. */
    url: z.url({ protocol: /^https$/ }).nullable(),
    deploymentId: z.string().min(1).nullable(),
    /** `git rev-parse HEAD` of the workspace, when it is a git checkout. */
    commit: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .nullable(),
    /** Uncommitted changes when the build ran (null outside git). */
    dirty: z.boolean().nullable(),
    /** sha256 over the built files' paths and hashes: identifies the exact build. */
    buildSha256: Sha256,
    fileCount: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative(),
    /** Static provider: the ZIP and its sha256. */
    zip: z.string().min(1).nullable(),
    zipSha256: Sha256.nullable(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.dryRun && entry.url !== null) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'a dry run has no URL' });
    }
    if (entry.kind === 'published' && (entry.dryRun || entry.url === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['url'],
        message: 'a real deploy records the URL the provider printed',
      });
    }
    if (entry.kind !== 'published' && entry.url !== null) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'only a real deploy has a URL' });
    }
  });

export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

/** Lists keys (at any depth) whose name looks like a credential. */
export function secretLikeKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [];
  const found: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (SECRET_KEY.test(key)) found.push(path);
    found.push(...secretLikeKeys(child, path));
  }
  return found;
}

/** Validates one entry; a credential-like key is refused before the schema runs. */
export function parseLedgerEntry(value: unknown): LedgerEntry {
  const secrets = secretLikeKeys(value);
  if (secrets.length > 0) {
    throw new Error(`Refusing ledger fields that look like credentials: ${secrets.join(', ')}.`);
  }
  return LedgerEntrySchema.parse(value);
}

/** sha256 over sorted `path\0sha256` lines: the same files give the same digest. */
export function buildDigest(files: readonly Pick<FileDigest, 'path' | 'sha256'>[]): string {
  return sha256Text(
    [...files]
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map((f) => `${f.path}\0${f.sha256}`)
      .join('\n')
  );
}

/** The workspace commit and whether the tree had uncommitted changes (nulls outside git). */
export async function gitState(
  root: string
): Promise<{ commit: string | null; dirty: boolean | null }> {
  const head = await run('git', ['rev-parse', 'HEAD'], { cwd: root, timeoutMs: 10_000 });
  const commit = head.code === 0 ? head.stdout.trim() : '';
  if (!/^[0-9a-f]{40}$/.test(commit)) return { commit: null, dirty: null };
  const status = await run('git', ['status', '--porcelain', '--untracked-files=no'], {
    cwd: root,
    timeoutMs: 10_000,
  });
  return { commit, dirty: status.code === 0 ? status.stdout.trim().length > 0 : null };
}

/**
 * Validates and appends one line. The whole line goes out in a single
 * `O_APPEND` write, so concurrent publishes never interleave inside a line
 * and a crash never leaves a half-written entry before an earlier one.
 */
export async function appendLedgerEntry(path: string, entry: unknown): Promise<LedgerEntry> {
  const parsed = parseLedgerEntry(entry);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(parsed)}\n`, { encoding: 'utf8', flag: 'a' });
  return parsed;
}

export interface LedgerRead {
  /** Valid entries, oldest first. */
  entries: LedgerEntry[];
  /** Lines that were not valid entries (hand edits, a newer format). */
  skipped: number;
}

export async function readLedger(path: string): Promise<LedgerRead> {
  if (!existsSync(path)) return { entries: [], skipped: 0 };
  const entries: LedgerEntry[] = [];
  let skipped = 0;
  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(parseLedgerEntry(JSON.parse(line)));
    } catch {
      skipped++;
    }
  }
  return { entries, skipped };
}
