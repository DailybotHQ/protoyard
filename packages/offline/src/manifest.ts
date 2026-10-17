import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Files a build may contain that must never be precached. */
const EXCLUDED = [
  /^sw\.js$/,
  /\.map$/,
  /\.zip$/,
  /^build-manifest\.json$/,
  /^\.DS_Store$/,
  /(^|\/)\./, // dotfiles
];

export interface PrecacheEntry {
  /** URL relative to the service worker (and the page): `assets/index-abc.js`. */
  url: string;
  /** sha256 of the file, first 16 hex chars. */
  hash: string;
  bytes: number;
}

export interface PrecacheManifest {
  /** Content hash of the whole build: a new deploy ⇒ a new version ⇒ a clean activation. */
  version: string;
  entries: PrecacheEntry[];
  totalBytes: number;
}

function walk(dir: string, root: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    // Symlinks are never followed: a build must not precache files from elsewhere.
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walk(path, root, out);
    else if (entry.isFile()) out.push(relative(root, path).split(sep).join('/'));
  }
}

/**
 * Lists every file of a finished build with its content hash. The version
 * hashes paths + contents, so it changes exactly when the deploy changes.
 */
export function createPrecacheManifest(outDir: string): PrecacheManifest {
  const files: string[] = [];
  walk(outDir, outDir, files);
  const entries = files
    .filter((file) => !EXCLUDED.some((pattern) => pattern.test(file)))
    .sort()
    .map((url) => {
      const content = readFileSync(join(outDir, url));
      return {
        url,
        hash: createHash('sha256').update(content).digest('hex').slice(0, 16),
        bytes: statSync(join(outDir, url)).size,
      };
    });
  const version = createHash('sha256')
    .update(entries.map((e) => `${e.url}:${e.hash}`).join('\n'))
    .digest('hex')
    .slice(0, 12);
  return { version, entries, totalBytes: entries.reduce((sum, e) => sum + e.bytes, 0) };
}

/** Vite's content-hashed file names (`index-B3x9Kq1z.js`): safe to serve cache-first forever. */
export function isHashedAsset(url: string): boolean {
  return /[-.][A-Za-z0-9_-]{8,}\.(js|css|woff2?|png|jpe?g|svg|webp|avif|gif|ico|json|wasm)$/.test(
    url
  );
}

export interface OfflineBuildInfo {
  version: string;
  /** Number of precached URLs (including the `./` shell). */
  precached: number;
}

/**
 * Reads the offline info back from a finished build (for the CLI's
 * build-manifest.json, which runs Vite in a child process). Null when the
 * build has no Protoyard service worker.
 */
export function readOfflineBuild(outDir: string): OfflineBuildInfo | null {
  let source: string;
  try {
    source = readFileSync(join(outDir, 'sw.js'), 'utf8');
  } catch {
    return null;
  }
  const match = /^const CONFIG = (\{.*\});$/m.exec(source);
  if (!match?.[1]) return null;
  try {
    const config = JSON.parse(match[1]) as { version?: unknown; precache?: unknown };
    if (typeof config.version !== 'string' || !Array.isArray(config.precache)) return null;
    return { version: config.version, precached: config.precache.length };
  } catch {
    return null;
  }
}
