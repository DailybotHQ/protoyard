import { readFile, writeFile } from 'node:fs/promises';
import { relative, sep } from 'node:path';
import { type Zippable, zipSync } from 'fflate';
import { listFiles, sha256Text } from './checksum.ts';

/** Fixed timestamp keeps ZIPs byte-identical across rebuilds of the same dist. */
const ZIP_EPOCH = new Date('2000-01-01T00:00:00Z');
const STORE_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|woff2?|zip|gz|br|mp4|webm)$/i;

export interface ZipResult {
  path: string;
  size: number;
  sha256: string;
  files: number;
}

/** Zips a directory's contents (entries relative to it) with deterministic order and times. */
export async function zipDirectory(source: string, destination: string): Promise<ZipResult> {
  const files = await listFiles(source);
  const tree: Zippable = {};
  for (const file of files) {
    const name = relative(source, file).split(sep).join('/');
    const data = new Uint8Array(await readFile(file));
    // Already-compressed formats are stored; deflating them wastes time for no gain.
    tree[name] = [data, { level: STORE_EXTENSIONS.test(name) ? 0 : 9, mtime: ZIP_EPOCH }];
  }
  const zipped = zipSync(tree, { mtime: ZIP_EPOCH });
  await writeFile(destination, zipped);
  return {
    path: destination,
    size: zipped.byteLength,
    sha256: sha256Text(zipped),
    files: files.length,
  };
}
