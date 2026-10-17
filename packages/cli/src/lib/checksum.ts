import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export interface FileDigest {
  /** POSIX path relative to the scanned root. */
  path: string;
  size: number;
  sha256: string;
}

export function sha256File(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolvePromise(hash.digest('hex')));
  });
}

export function sha256Text(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Bookkeeping files the CLI writes into outputs (see lib/output-guard.ts). */
const IGNORED_FILES = new Set(['.protoyard-out', '.protoyard-showcase']);

/**
 * All regular files under `root`, sorted by POSIX path for stable output.
 * Symlinks are not followed and output markers are skipped.
 */
export async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && !IGNORED_FILES.has(entry.name)) out.push(full);
    }
  }
  await walk(root);
  return out.sort((a, b) => toPosix(relative(root, a)).localeCompare(toPosix(relative(root, b))));
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

export async function digestDirectory(root: string): Promise<FileDigest[]> {
  const files = await listFiles(root);
  return Promise.all(
    files.map(async (file) => ({
      path: toPosix(relative(root, file)),
      size: (await stat(file)).size,
      sha256: await sha256File(file),
    }))
  );
}
