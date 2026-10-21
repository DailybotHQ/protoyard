import { lstat, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkSlug } from '@protoyard/core';
import type { CommandResult, Handler } from '../../lib/command.ts';
import { CliError, mark } from '../../lib/output.ts';
import { QUICK_MARKER } from '../../lib/output-guard.ts';
import { toPosixRelative } from '../../lib/paths.ts';
import { type QuickIndexEntry, renderQuickIndex } from '../../lib/quick/index-html.ts';
import { readQuickRecord } from '../../lib/quick/model.ts';
import { resolveQuickBase } from '../../lib/quick/paths.ts';
import { quickServeCommand } from './serve.ts';

/**
 * `protoyard quick list`, `quick open <slug>` and `quick index`: read every
 * exploration under the quick zone (`.protoyard/quick/`). Only real folders
 * that carry the quick marker are read (never symlinks, the shared `_player/`
 * or folders Protoyard did not write), and each quick.json is validated as
 * untrusted input. Explorations never enter the prototype registry.
 */

/** Cap on a blueprint read only for its name. */
const NAME_BLUEPRINT_MAX_BYTES = 2 * 1024 * 1024;

export interface QuickListEntry {
  slug: string;
  /** The folder name inside the zone (usually the slug). */
  folder: string;
  /** The exploration folder, relative to the workspace. */
  dir: string;
  name: string | null;
  source: 'brief' | 'blueprint';
  createdAt: string;
  updatedAt: string;
  layout: 'shared' | 'standalone';
  playerVersion: string;
  /** Launcher, relative to the workspace. */
  open: string;
  variants: { id: string; label: string; open: string }[];
  compare: string | null;
  review: string | null;
  shares: number;
  promotedTo: { slug: string; variant: string | null; at: string } | null;
}

export interface QuickScan {
  /** The quick zone, relative to the workspace. */
  root: string;
  explorations: QuickListEntry[];
  /** Marked folders whose quick.json could not be read. */
  skipped: { folder: string; reason: string }[];
}

const isFile = async (path: string) =>
  (await lstat(path).catch(() => undefined))?.isFile() === true;

/** The blueprint's `name`, or null; only used as a label, never trusted further. */
async function blueprintName(path: string): Promise<string | null> {
  const info = await lstat(path).catch(() => undefined);
  if (!info?.isFile() || info.size > NAME_BLUEPRINT_MAX_BYTES) return null;
  try {
    const name = (JSON.parse(await readFile(path, 'utf8')) as { name?: unknown }).name;
    return typeof name === 'string' && name.length > 0 && name.length <= 160 ? name : null;
  } catch {
    return null;
  }
}

/** Reads every marked exploration in the zone, newest first. */
export async function scanQuickExplorations(
  workspaceRoot: string,
  cwd: string
): Promise<QuickScan> {
  const { zone } = resolveQuickBase({ workspaceRoot, cwd });
  const rel = (path: string) => toPosixRelative(workspaceRoot, path);
  const scan: QuickScan = { root: rel(zone), explorations: [], skipped: [] };
  const zoneInfo = await lstat(zone).catch(() => undefined);
  if (!zoneInfo?.isDirectory()) return scan;

  for (const entry of await readdir(zone, { withFileTypes: true })) {
    // Real folders with a slug name only: never symlinks, `_player/` or stray files.
    if (!entry.isDirectory() || !checkSlug(entry.name).ok) continue;
    const dir = join(zone, entry.name);
    if (!(await isFile(join(dir, QUICK_MARKER)))) continue;
    let record: Awaited<ReturnType<typeof readQuickRecord>>;
    try {
      record = await readQuickRecord(dir);
    } catch (error) {
      scan.skipped.push({ folder: entry.name, reason: (error as Error).message });
      continue;
    }
    const variants = [];
    for (const variant of record.variants) {
      variants.push({
        id: variant.id,
        label: variant.label,
        open: rel(join(dir, variant.dir, 'index.html')),
      });
    }
    scan.explorations.push({
      slug: record.slug,
      folder: entry.name,
      dir: rel(dir),
      name: await blueprintName(join(dir, 'blueprint.json')),
      source: record.source,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      layout: record.player.standalone ? 'standalone' : 'shared',
      playerVersion: record.player.version,
      open: rel(join(dir, 'index.html')),
      variants,
      compare: (await isFile(join(dir, 'compare.html'))) ? rel(join(dir, 'compare.html')) : null,
      review: (await isFile(join(dir, 'REVIEW.md'))) ? rel(join(dir, 'REVIEW.md')) : null,
      shares: record.shares.length,
      promotedTo: record.promotedTo,
    });
  }
  scan.explorations.sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.folder.localeCompare(b.folder)
  );
  scan.skipped.sort((a, b) => a.folder.localeCompare(b.folder));
  return scan;
}

export const quickListCommand: Handler = async (ctx): Promise<CommandResult> => {
  const scan = await scanQuickExplorations(ctx.root, process.cwd());
  return {
    data: scan,
    render(out) {
      const { c } = out;
      if (scan.explorations.length === 0) {
        out.always(
          `No explorations in ${scan.root}. Create one with \`protoyard quick "<brief>"\`.`
        );
      }
      for (const entry of scan.explorations) {
        const extras = [
          entry.variants.length > 0 ? `${entry.variants.length} variants` : '',
          entry.review ? 'REVIEW.md' : '',
          entry.promotedTo ? `→ prototypes/${entry.promotedTo.slug}` : '',
        ].filter(Boolean);
        out.always(
          `${c.bold(entry.slug.padEnd(24))} ${entry.name ?? ''}${extras.length > 0 ? c.dim(`  (${extras.join(', ')})`) : ''}`
        );
        out.info(c.dim(`  ${entry.dir}  updated ${entry.updatedAt}`));
      }
      for (const skip of scan.skipped) {
        out.warn(`${mark(c, 'warn')} skipped ${skip.folder}: ${skip.reason}`);
      }
    },
  };
};

/** `quick open <slug>`: finds the exploration in the zone, then serves and opens it. */
export const quickOpenCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const wanted = args[0] ?? '';
  if (!wanted) {
    throw new CliError('usage', 'Name the exploration to open.', {
      hint: 'protoyard quick list   shows every exploration and its slug.',
    });
  }
  const scan = await scanQuickExplorations(ctx.root, process.cwd());
  const found = scan.explorations.find((entry) => entry.slug === wanted || entry.folder === wanted);
  if (!found) {
    throw new CliError('not_found', `No exploration named "${wanted}" in ${scan.root}.`, {
      hint:
        scan.explorations.length > 0
          ? `Known: ${scan.explorations
              .slice(0, 8)
              .map((entry) => entry.slug)
              .join(', ')}${scan.explorations.length > 8 ? ', …' : ''}.`
          : 'Create one with `protoyard quick "<brief>"`.',
    });
  }
  // The player needs http, so opening is serving on 127.0.0.1 and launching the browser.
  return quickServeCommand(ctx, [join(ctx.root, found.dir)], { ...options, open: true });
};

/** `quick index`: writes `<zone>/index.html` linking every exploration. */
export const quickIndexCommand: Handler = async (ctx): Promise<CommandResult> => {
  const scan = await scanQuickExplorations(ctx.root, process.cwd());
  const zone = join(ctx.root, scan.root);
  const zoneInfo = await lstat(zone).catch(() => undefined);
  if (!zoneInfo?.isDirectory()) {
    throw new CliError('not_found', `No quick zone at ${scan.root}.`, {
      hint: 'Create an exploration with `protoyard quick "<brief>"` first.',
    });
  }
  // Links are relative to the zone, where index.html lives.
  const inZone = (path: string | null) => (path === null ? null : path.slice(scan.root.length + 1));
  const entries: QuickIndexEntry[] = scan.explorations.map((entry) => ({
    slug: entry.slug,
    name: entry.name,
    source: entry.source,
    updatedAt: entry.updatedAt,
    open: inZone(entry.open) ?? '',
    variants: entry.variants.map((variant) => ({
      label: `${variant.id}: ${variant.label}`,
      href: inZone(variant.open) ?? '',
    })),
    compare: inZone(entry.compare),
    review: inZone(entry.review),
    promotedTo: entry.promotedTo?.slug ?? null,
  }));
  const file = join(zone, 'index.html');
  const existing = await lstat(file).catch(() => undefined);
  if (existing && !existing.isFile()) {
    throw new CliError('unsafe_path', `Refusing to replace ${scan.root}/index.html: not a file.`);
  }
  const html = renderQuickIndex(entries);
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, html, 'utf8');
  await rename(temp, file);
  const data = {
    file: `${scan.root}/index.html`,
    explorations: entries.length,
    skipped: scan.skipped,
  };
  return {
    data,
    render(out) {
      const { c } = out;
      out.always(
        `${mark(c, 'pass')} ${c.cyan(data.file)} links ${entries.length} exploration${entries.length === 1 ? '' : 's'}`
      );
      for (const skip of scan.skipped) {
        out.warn(`${mark(c, 'warn')} skipped ${skip.folder}: ${skip.reason}`);
      }
    },
  };
};
