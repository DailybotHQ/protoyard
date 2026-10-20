import { spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_CONTROL_PORT,
  DEFAULT_GALLERY_PORT,
  defaultAllowedOrigins,
  startControlServer,
} from '../control-server.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { untilSignal } from '../lib/network.ts';
import { CliError, mark } from '../lib/output.ts';
import { parsePort } from '../lib/ports.ts';
import { resolvePackageBin } from '../lib/process.ts';
import { buildIndex } from '../lib/registry.ts';

function origins(options: Record<string, unknown>, galleryPort: number): string[] {
  const extra = (opt(options, 'allowOrigin') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  for (const origin of extra) {
    if (!/^https?:\/\/[^/\s]+$/.test(origin)) {
      throw new CliError(
        'usage',
        `Invalid --allow-origin "${origin}" (expected scheme://host:port).`
      );
    }
  }
  return [...defaultAllowedOrigins(galleryPort), ...extra];
}

/** `protoyard control-server`: only the local API (for a gallery started separately). */
export const controlServerCommand: Handler = async (
  ctx,
  _args,
  options
): Promise<CommandResult> => {
  const galleryPort = parsePort(opt(options, 'galleryPort'), DEFAULT_GALLERY_PORT);
  const control = await startControlServer({
    root: ctx.root,
    port: parsePort(opt(options, 'port'), DEFAULT_CONTROL_PORT),
    allowedOrigins: origins(options, galleryPort),
    allowCreate: flag(options, 'allowCreate'),
    log: (line) => ctx.out.info(ctx.out.c.dim(`[control] ${line}`)),
  });
  return {
    data: { url: control.url, port: control.port },
    render(out) {
      out.always(
        `${mark(out.c, 'pass')} Control server on ${out.c.cyan(control.url)} (localhost only)`
      );
      out.info(
        flag(options, 'allowCreate')
          ? `${mark(out.c, 'warn')} Creating prototypes from the gallery is ON (--allow-create): allowed origins can write prototypes/ and run the copies.`
          : `${mark(out.c, 'skip')} Creating prototypes from the gallery is off (pass --allow-create to enable it).`
      );
    },
    keepAlive: untilSignal(() => control.close()),
  };
};

export const GALLERY_PACKAGE = '@protoyard/gallery';

export interface GalleryLocation {
  /** Real path of the gallery's Astro project. */
  dir: string;
  /** `package`: resolved as @protoyard/gallery; `workspace`: this repository's apps/gallery. */
  source: 'package' | 'workspace';
}

/** The folder is the gallery when its package.json names it and it has an Astro config. */
function isGallery(dir: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: unknown };
    return pkg.name === GALLERY_PACKAGE && existsSync(join(dir, 'astro.config.mjs'));
  } catch {
    return false;
  }
}

/**
 * The `node_modules/@protoyard/gallery` folder nearest to `from`, walking up
 * like Node does. Unlike `require.resolve`, it ignores NODE_PATH (which pnpm
 * sets for scripts), so a consumer workspace never picks up an unrelated copy.
 */
function installedGallery(from: string): string | null {
  let dir = from;
  while (true) {
    const candidate = join(dir, 'node_modules', GALLERY_PACKAGE);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Finds the Astro gallery: first as the `@protoyard/gallery` package installed
 * in the workspace (a consumer workspace that added it) and then next to the
 * CLI itself, then `<root>/apps/gallery` in this repository. Package-manager
 * symlinks resolve to the real folder, and a folder only counts when its
 * package.json names the gallery and it has an Astro config.
 */
export function resolveGalleryDir(
  root: string,
  options: { fromDirs?: readonly string[] } = {}
): GalleryLocation | null {
  const fromDirs = options.fromDirs ?? [root, dirname(fileURLToPath(import.meta.url))];
  for (const from of fromDirs) {
    const found = installedGallery(from);
    if (!found) continue;
    const dir = realpathSync(found);
    if (isGallery(dir)) return { dir, source: 'package' };
  }
  const workspace = join(root, 'apps', 'gallery');
  return isGallery(workspace) ? { dir: realpathSync(workspace), source: 'workspace' } : null;
}

/** resolveGalleryDir or a `not_found` CliError with an install hint. */
export function requireGalleryDir(
  root: string,
  options: { fromDirs?: readonly string[] } = {}
): GalleryLocation {
  const gallery = resolveGalleryDir(root, options);
  if (gallery) return gallery;
  throw new CliError('not_found', `The Protoyard gallery (${GALLERY_PACKAGE}) is not installed.`, {
    hint: `Add ${GALLERY_PACKAGE} to this workspace (pnpm add -D ${GALLERY_PACKAGE}), or run inside the Protoyard repository.`,
  });
}

/** `protoyard gallery`: index, control server and the Astro gallery in one process tree (`pnpm dev`). */
export const galleryCommand: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  const gallery = requireGalleryDir(ctx.root);
  const galleryDir = gallery.dir;
  const astro = resolvePackageBin('astro', 'astro', [galleryDir, ctx.root]);
  if (!astro)
    throw new CliError('not_found', 'Astro is not installed.', { hint: 'Run `pnpm install`.' });
  const galleryPort = parsePort(opt(options, 'port'), DEFAULT_GALLERY_PORT);
  const index = await buildIndex(ctx.paths);
  const control = await startControlServer({
    root: ctx.root,
    port: parsePort(opt(options, 'controlPort'), DEFAULT_CONTROL_PORT),
    allowedOrigins: origins(options, galleryPort),
    allowCreate: flag(options, 'allowCreate'),
    log: (line) => ctx.out.info(ctx.out.c.dim(`[control] ${line}`)),
  });
  const child = spawn(
    process.execPath,
    // --ignore-lock keeps Astro in the foreground even when it detects an AI
    // agent (Astro 7 would otherwise background it and outlive `pnpm dev`).
    [astro, 'dev', '--ignore-lock', '--port', String(galleryPort), '--host', '127.0.0.1'],
    {
      cwd: galleryDir,
      env: {
        ...process.env,
        PUBLIC_PROTOYARD_CONTROL_URL: control.url,
        // The gallery may live in node_modules: point it at this workspace's registry.
        PROTOYARD_REGISTRY: ctx.paths.registry,
        // Keep Astro and Vite caches in the workspace, not in an installed package.
        ...(gallery.source === 'package' && !process.env.PROTOYARD_GALLERY_CACHE_DIR
          ? { PROTOYARD_GALLERY_CACHE_DIR: join(ctx.paths.state, 'gallery-cache') }
          : {}),
      },
      shell: false,
      stdio: ctx.out.options.json ? 'ignore' : 'inherit',
    }
  );
  const exited = new Promise<void>((r) => child.once('exit', () => r()));
  const stop = async () => {
    child.kill('SIGTERM');
    await control.close();
  };
  return {
    data: {
      gallery: `http://localhost:${galleryPort}/`,
      control: control.url,
      indexed: index.registry.stats,
    },
    render(out) {
      const { c } = out;
      out.always(
        `${mark(c, 'pass')} Indexed ${index.registry.stats.total} projects · control server ${c.cyan(control.url)}`
      );
      out.always(
        `  Gallery: ${c.cyan(`http://localhost:${galleryPort}/`)} ${c.dim('(starting…)')}`
      );
    },
    keepAlive: Promise.race([exited.then(() => control.close()), untilSignal(stop)]),
  };
};
