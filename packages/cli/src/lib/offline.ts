import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** What `build-manifest.json` records about the opt-in offline service worker. */
export type OfflineRecord = { enabled: true; version: string; precached: number } | false;

type Reader = (outDir: string) => { version: string; precached: number } | null;

/**
 * Loads `readOfflineBuild` from @protoyard/offline, falling back to the
 * workspace source when the package is not linked into the CLI yet, so a
 * missing install can never break builds; without either, offline is
 * reported as not detected.
 */
async function loadReader(root: string): Promise<Reader | null> {
  for (const specifier of [
    '@protoyard/offline',
    pathToFileURL(join(root, 'packages/offline/src/index.ts')).href,
  ]) {
    try {
      const mod = (await import(specifier)) as { readOfflineBuild?: Reader };
      if (typeof mod.readOfflineBuild === 'function') return mod.readOfflineBuild;
    } catch {
      // try the next location
    }
  }
  return null;
}

export async function readOfflineRecord(root: string, outDir: string): Promise<OfflineRecord> {
  const reader = await loadReader(root);
  const info = reader?.(outDir) ?? null;
  return info ? { enabled: true, version: info.version, precached: info.precached } : false;
}
