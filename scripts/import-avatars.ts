/**
 * Import the repository owner's fictional avatar portraits into
 * `@protoyard/avatars` (`packages/avatars`).
 *
 *   tsx scripts/import-avatars.ts [--src <dir>] [--check] [--dry-run]
 *
 * Reads `<src>/avatar<N>.png` (N = 1…175; `_manifests/` and `_previews/` are
 * ignored), insets 6 px to drop the slicing border and rounded transparent
 * corners, center-crops to a square, flattens onto white, resizes
 * (lanczos3) to 64 and 128 px and encodes lossy WebP without metadata.
 * Writes `packages/avatars/assets/<size>/av-NNN.webp` and
 * `packages/avatars/src/manifest.json`. Ids follow the source number
 * (`avatar7.png` → `av-007`).
 *
 * Deterministic: no timestamps, no randomness, sorted input. The same source
 * bytes and the same sharp/libvips/libwebp build give byte-identical output.
 *
 * `--check` re-encodes in memory and fails (exit 1) when any committed file
 * or the manifest differs; it writes nothing. `--dry-run` reports what would
 * be written. The script never writes outside `packages/avatars`.
 *
 * Default `--src`: `~/projects/ptt/avatars-grids-recortes` (the owner's
 * local folder; the original PNGs are never copied into the repository).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The slice of the sharp API this script uses (sharp is resolved at runtime). */
interface SharpPipeline {
  metadata(): Promise<{ width?: number; height?: number }>;
  extract(region: { left: number; top: number; width: number; height: number }): SharpPipeline;
  flatten(options: { background: string }): SharpPipeline;
  resize(width: number, height: number, options: { kernel: string }): SharpPipeline;
  removeAlpha(): SharpPipeline;
  webp(options: { quality: number; effort: number; smartSubsample: boolean }): SharpPipeline;
  toBuffer(): Promise<Buffer>;
}
interface SharpModule {
  (input: Buffer): SharpPipeline;
  versions: Record<string, string | undefined>;
  cache(enabled: boolean): void;
  concurrency(threads: number): number;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'packages', 'avatars');
const MANIFEST = join(PKG, 'src', 'manifest.json');
const DEFAULT_SRC = join(homedir(), 'projects', 'ptt', 'avatars-grids-recortes');

/** Edge inset in source pixels: removes the 1–2 px light border and the rounded corners. */
const INSET = 6;
/** Per-size WebP quality, tuned visually and by PSNR (see packages/avatars/README.md). */
const SIZES = [
  { size: 64, quality: 70 },
  { size: 128, quality: 65 },
] as const;
const EFFORT = 6;

interface FileEntry {
  path: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
}
interface AvatarEntry {
  id: string;
  index: number;
  source: { file: string; sha256: string };
  files: Record<string, FileEntry>;
}
interface Manifest {
  name: '@protoyard/avatars';
  format: 'webp';
  count: number;
  encoder: {
    inset: number;
    background: string;
    kernel: string;
    effort: number;
    smartSubsample: boolean;
    quality: Record<string, number>;
    sharp: string;
    libvips: string;
    webp: string;
  };
  avatars: AvatarEntry[];
}

function loadSharp(): SharpModule {
  const candidates = [join(PKG, 'package.json'), join(ROOT, 'apps', 'gallery', 'package.json')];
  for (const from of candidates) {
    try {
      const req = createRequire(from);
      try {
        return req('sharp') as SharpModule;
      } catch {
        // apps/gallery reaches sharp through astro.
        const astro = createRequire(req.resolve('astro/package.json'));
        return astro('sharp') as SharpModule;
      }
    } catch {
      // try the next candidate
    }
  }
  throw new Error(
    'import-avatars: cannot resolve sharp (devDependency of packages/avatars; run pnpm install)'
  );
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Absolute path inside packages/avatars, or throw. */
function inPackage(path: string): string {
  const abs = resolve(path);
  const rel = relative(PKG, abs);
  if (rel === '' || rel.startsWith('..') || rel.startsWith(sep) || resolve(PKG, rel) !== abs) {
    throw new Error(`import-avatars: refusing to write outside packages/avatars: ${abs}`);
  }
  return abs;
}

function parseArgs(argv: string[]): { src: string; check: boolean; dryRun: boolean } {
  let src = DEFAULT_SRC;
  let check = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--src') {
      const value = argv[++i];
      if (!value) throw new Error('import-avatars: --src needs a directory');
      src = resolve(value);
    } else if (arg === '--check') check = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '-h' || arg === '--help') {
      console.log('usage: tsx scripts/import-avatars.ts [--src <dir>] [--check] [--dry-run]');
      process.exit(0);
    } else throw new Error(`import-avatars: unknown argument ${arg}`);
  }
  return { src, check, dryRun };
}

function listSources(src: string): { n: number; file: string }[] {
  if (!existsSync(src)) throw new Error(`import-avatars: source folder not found: ${src}`);
  const found = readdirSync(src)
    .map((file) => ({ file, match: /^avatar(\d+)\.png$/.exec(file) }))
    .filter((e): e is { file: string; match: RegExpExecArray } => e.match !== null)
    .map(({ file, match }) => ({ n: Number(match[1]), file }))
    .sort((a, b) => a.n - b.n);
  if (found.length === 0) throw new Error(`import-avatars: no avatar<N>.png in ${src}`);
  found.forEach((entry, i) => {
    if (entry.n !== i + 1) {
      throw new Error(`import-avatars: expected avatar${i + 1}.png, found ${entry.file}`);
    }
  });
  if (found.length > 999) throw new Error('import-avatars: ids support at most 999 avatars');
  return found;
}

async function encode(
  sharp: SharpModule,
  input: Buffer,
  size: number,
  quality: number
): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const w = (meta.width ?? 0) - 2 * INSET;
  const h = (meta.height ?? 0) - 2 * INSET;
  const side = Math.min(w, h);
  if (side < size) throw new Error(`import-avatars: source smaller than ${size} px after inset`);
  return sharp(input)
    .extract({
      left: INSET + Math.floor((w - side) / 2),
      top: INSET + Math.floor((h - side) / 2),
      width: side,
      height: side,
    })
    .flatten({ background: '#ffffff' })
    .resize(size, size, { kernel: 'lanczos3' })
    .removeAlpha()
    .webp({ quality, effort: EFFORT, smartSubsample: true })
    .toBuffer();
}

async function main(): Promise<void> {
  const { src, check, dryRun } = parseArgs(process.argv.slice(2));
  const sharp = loadSharp();
  sharp.cache(false);
  sharp.concurrency(1);
  const sources = listSources(src);

  const outputs = new Map<string, Buffer>();
  const avatars: AvatarEntry[] = [];
  for (const { n, file } of sources) {
    const input = readFileSync(join(src, file));
    const id = `av-${String(n).padStart(3, '0')}`;
    const files: Record<string, FileEntry> = {};
    for (const { size, quality } of SIZES) {
      const buf = await encode(sharp, input, size, quality);
      const path = `assets/${size}/${id}.webp`;
      outputs.set(path, buf);
      files[String(size)] = {
        path,
        bytes: buf.length,
        sha256: sha256(buf),
        width: size,
        height: size,
      };
    }
    avatars.push({ id, index: n, source: { file, sha256: sha256(input) }, files });
  }

  const manifest: Manifest = {
    name: '@protoyard/avatars',
    format: 'webp',
    count: avatars.length,
    encoder: {
      inset: INSET,
      background: '#ffffff',
      kernel: 'lanczos3',
      effort: EFFORT,
      smartSubsample: true,
      quality: Object.fromEntries(SIZES.map((s) => [String(s.size), s.quality])),
      sharp: sharp.versions.sharp ?? 'unknown',
      libvips: sharp.versions.vips ?? 'unknown',
      webp: sharp.versions.webp ?? 'unknown',
    },
    avatars,
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;

  const totals = SIZES.map(({ size }) => {
    const bytes = avatars.map((a) => a.files[String(size)]?.bytes ?? 0);
    const sum = bytes.reduce((x, y) => x + y, 0);
    return `${size}px: ${bytes.length} files, ${(sum / 1024).toFixed(1)} KB total, ${(sum / bytes.length / 1024).toFixed(2)} KB avg, ${(Math.max(...bytes) / 1024).toFixed(2)} KB max`;
  });

  if (check) {
    const problems: string[] = [];
    for (const [path, buf] of outputs) {
      const abs = join(PKG, path);
      if (!existsSync(abs)) problems.push(`missing ${path}`);
      else if (!readFileSync(abs).equals(buf)) problems.push(`differs ${path}`);
    }
    for (const { size } of SIZES) {
      const dir = join(PKG, 'assets', String(size));
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) {
        if (!outputs.has(`assets/${size}/${f}`)) problems.push(`unexpected assets/${size}/${f}`);
      }
    }
    const committed = existsSync(MANIFEST) ? readFileSync(MANIFEST, 'utf8') : '';
    if (committed !== manifestText) {
      const prev = committed ? (JSON.parse(committed) as Manifest).encoder : undefined;
      const envNote =
        prev && (prev.sharp !== manifest.encoder.sharp || prev.webp !== manifest.encoder.webp)
          ? ` (encoder differs: committed sharp ${prev.sharp}/webp ${prev.webp}, local sharp ${manifest.encoder.sharp}/webp ${manifest.encoder.webp})`
          : '';
      problems.push(`differs src/manifest.json${envNote}`);
    }
    if (problems.length > 0) {
      for (const p of problems.slice(0, 20)) console.error(`import-avatars --check: ${p}`);
      if (problems.length > 20) console.error(`… and ${problems.length - 20} more`);
      process.exit(1);
    }
    console.log(`import-avatars --check: ok, ${avatars.length} avatars match the source`);
    for (const line of totals) console.log(`  ${line}`);
    return;
  }

  if (dryRun) {
    console.log(`import-avatars --dry-run: would write ${outputs.size} files + src/manifest.json`);
    for (const line of totals) console.log(`  ${line}`);
    return;
  }

  for (const { size } of SIZES) {
    const dir = inPackage(join(PKG, 'assets', String(size)));
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
  for (const [path, buf] of outputs) writeFileSync(inPackage(join(PKG, path)), buf);
  writeFileSync(inPackage(MANIFEST), manifestText);
  console.log(`import-avatars: wrote ${outputs.size} files + src/manifest.json`);
  for (const line of totals) console.log(`  ${line}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
