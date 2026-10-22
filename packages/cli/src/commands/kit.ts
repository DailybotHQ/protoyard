import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag } from '../lib/command.ts';
import { CliError } from '../lib/output.ts';
import { resolveTarget } from '../lib/workspace.ts';

const KIT_MANIFEST = '.protoyard-kit.json';
const MAX_FILES = 500;
const MAX_BYTES = 5 * 1024 * 1024;

interface KitManifest {
  format: 'protoyard-kit-sync/v1';
  kit: string;
  source: string;
  hash: string;
  files: Record<string, string>;
}

export const kitSyncCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const [kitSlug, prototypeSlug] = args;
  if (!kitSlug || !prototypeSlug) {
    throw new CliError('usage', 'Provide <kit> and <prototype>.');
  }
  if (kitSlug === prototypeSlug) {
    throw new CliError('usage', 'The kit and destination prototype must be different.');
  }

  const kit = await resolveTarget(ctx, kitSlug, 'runnable');
  const prototype = await resolveTarget(ctx, prototypeSlug, 'prototype');
  const sourceDir = resolveComponentSource(kit.dir);
  assertNoSymlinkPath(kit.dir, sourceDir);
  const targetDir = join(prototype.dir, 'src', 'components', kit.entry.slug);
  assertInside(prototype.dir, targetDir);
  assertNoSymlinkPath(prototype.dir, targetDir);

  const sourceFiles = readTree(sourceDir);
  if (sourceFiles.size === 0) {
    throw new CliError('validation', `${kit.entry.slug} has no component files to sync.`);
  }
  validateRelativeImports(sourceFiles);
  const sourceHashes = hashFiles(sourceFiles);
  const source = relative(ctx.root, sourceDir).split(sep).join('/');
  const hash = hashManifest(sourceHashes);
  const check = flag(options, 'check');

  if (check) {
    const current = readTarget(targetDir, kit.entry.slug, source);
    const differences = compareHashes(sourceHashes, current.files);
    const sourceDrift = current.manifest.hash !== hash;
    const targetDrift = current.manifest.hash !== hashManifest(current.files);
    const ok = !sourceDrift && !targetDrift && differences.length === 0;
    const data = {
      kit: kit.entry.slug,
      prototype: prototype.entry.slug,
      source,
      target: relative(ctx.root, targetDir).split(sep).join('/'),
      hash,
      checked: true,
      ok,
      differences,
      sourceDrift,
      targetDrift,
    };
    return {
      data,
      ...(ok
        ? {}
        : {
            failure: new CliError(
              'validation',
              `Kit "${kit.entry.slug}" has drift in ${prototype.entry.slug}.`
            ),
          }),
      render(out) {
        out.always(
          (ok ? '✓' : '✗') +
            ' ' +
            kit.entry.slug +
            ' → ' +
            prototype.entry.slug +
            (ok
              ? ' is in sync.'
              : ' has drift: ' +
                (differences.join(', ') || 'source or manifest hash changed') +
                '.')
        );
      },
    };
  }

  const existing = readExistingManifest(targetDir);
  if (existsSync(targetDir) && !existing) {
    throw new CliError(
      'conflict',
      `Refusing to replace unmanaged ${relative(ctx.root, targetDir)}.`,
      {
        hint:
          'Move the existing folder, then run protoyard kit sync ' +
          kit.entry.slug +
          ' ' +
          prototype.entry.slug +
          '.',
      }
    );
  }
  if (
    existing &&
    (existing.kit !== kit.entry.slug || existing.format !== 'protoyard-kit-sync/v1')
  ) {
    throw new CliError(
      'validation',
      `${relative(ctx.root, targetDir)}/${KIT_MANIFEST} is invalid.`
    );
  }

  const manifest: KitManifest = {
    format: 'protoyard-kit-sync/v1',
    kit: kit.entry.slug,
    source,
    hash,
    files: sourceHashes,
  };
  const temporary = `${targetDir}.protoyard-tmp-${process.pid}`;
  try {
    rmSync(temporary, { recursive: true, force: true });
    mkdirSync(temporary, { recursive: true });
    for (const [path, bytes] of sourceFiles) {
      const destination = join(temporary, path);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, bytes);
    }
    writeFileSync(join(temporary, KIT_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    mkdirSync(dirname(targetDir), { recursive: true });
    if (existsSync(targetDir)) rmSync(targetDir, { recursive: true });
    renameSync(temporary, targetDir);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw new CliError('validation', `Could not sync kit "${kit.entry.slug}": ${message(error)}`);
  }

  return {
    data: {
      kit: kit.entry.slug,
      prototype: prototype.entry.slug,
      source,
      target: relative(ctx.root, targetDir).split(sep).join('/'),
      hash,
      files: Object.keys(sourceHashes).length,
      checked: false,
      written: true,
    },
    render(out) {
      out.always(
        '✓ Synced ' +
          Object.keys(sourceHashes).length +
          ' files from ' +
          kit.entry.slug +
          ' to ' +
          prototype.entry.slug +
          ' (' +
          hash +
          ').'
      );
    },
  };
};

function resolveComponentSource(kitDir: string): string {
  for (const candidate of ['src/components', 'src/demos/components']) {
    const path = join(kitDir, candidate);
    if (existsSync(path) && lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink()) {
      return path;
    }
  }
  throw new CliError(
    'not_found',
    `Kit ${kitDir} has no src/components or src/demos/components folder.`
  );
}

function readTree(root: string, ignoreManifest = false): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let total = 0;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      if (entry.name === KIT_MANIFEST) {
        if (ignoreManifest && dir === root) continue;
        throw new CliError('validation', `Kit source reserves the filename ${KIT_MANIFEST}.`);
      }
      const path = join(dir, entry.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink())
        throw new CliError('unsafe_path', `Kit source contains a symlink: ${path}.`);
      if (stat.isDirectory()) {
        walk(path);
      } else if (stat.isFile()) {
        const key = relative(root, path).split(sep).join('/');
        const bytes = readFileSync(path);
        total += bytes.byteLength;
        if (files.size >= MAX_FILES || total > MAX_BYTES) {
          throw new CliError(
            'validation',
            `Kit source exceeds the ${MAX_FILES}-file or ${MAX_BYTES}-byte sync limit.`
          );
        }
        files.set(key, bytes);
      }
    }
  };
  walk(root);
  return files;
}

function hashFiles(files: Map<string, Buffer>): Record<string, string> {
  return Object.fromEntries(
    [...files].map(([path, bytes]) => [path, createHash('sha256').update(bytes).digest('hex')])
  );
}

function validateRelativeImports(files: Map<string, Buffer>): void {
  const relativeImport = /\b(?:from\s*|import\s*(?:\(\s*)?)['"](\.{1,2}\/[^'"]+)['"]/g;
  for (const [file, bytes] of files) {
    const source = bytes.toString('utf8');
    for (const match of source.matchAll(relativeImport)) {
      const specifier = match[1];
      if (!specifier) continue;
      const resolved = resolve('/kit-components', dirname(file), specifier);
      if (resolved !== '/kit-components' && !resolved.startsWith('/kit-components/')) {
        throw new CliError(
          'validation',
          `Relative import "${specifier}" in ${file} escapes the synced component tree.`,
          {
            hint: 'Move the dependency into the component folder before syncing so exports stay isolated.',
          }
        );
      }
    }
  }
}

function hashManifest(files: Record<string, string>): string {
  return createHash('sha256')
    .update(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))))
    .digest('hex');
}

function readTarget(
  targetDir: string,
  kit: string,
  source: string
): { manifest: KitManifest; files: Record<string, string> } {
  const manifest = readExistingManifest(targetDir);
  if (
    manifest?.format !== 'protoyard-kit-sync/v1' ||
    manifest.kit !== kit ||
    manifest.source !== source
  ) {
    throw new CliError(
      'not_found',
      `No valid synced kit manifest found at ${targetDir}/${KIT_MANIFEST}.`
    );
  }
  return { manifest, files: hashFiles(readTree(targetDir, true)) };
}

function readExistingManifest(targetDir: string): KitManifest | null {
  const path = join(targetDir, KIT_MANIFEST);
  if (!existsSync(path)) return null;
  if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) {
    throw new CliError('unsafe_path', `Refusing to follow ${path}.`);
  }
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Partial<KitManifest>;
    if (
      record.format !== 'protoyard-kit-sync/v1' ||
      typeof record.kit !== 'string' ||
      typeof record.source !== 'string' ||
      typeof record.hash !== 'string' ||
      !record.files ||
      typeof record.files !== 'object' ||
      Array.isArray(record.files)
    )
      return null;
    return record as KitManifest;
  } catch {
    return null;
  }
}

function compareHashes(expected: Record<string, string>, actual: Record<string, string>): string[] {
  return [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
    .filter((path) => expected[path] !== actual[path])
    .sort();
}

function assertInside(root: string, path: string): void {
  const resolvedRoot = resolve(root);
  if (!resolve(path).startsWith(resolvedRoot + sep)) {
    throw new CliError('unsafe_path', `Refusing to write outside ${root}.`);
  }
}

function assertNoSymlinkPath(root: string, path: string): void {
  const base = resolve(root);
  const destination = resolve(path);
  if (!destination.startsWith(base + sep)) {
    throw new CliError('unsafe_path', `Refusing to write outside ${root}.`);
  }
  const segments = relative(base, destination).split(sep);
  let current = base;
  for (const segment of segments) {
    current = join(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new CliError('unsafe_path', `Refusing to follow symlink ${current}.`);
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
