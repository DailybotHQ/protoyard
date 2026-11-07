import { existsSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { lanAddresses, untilSignal } from '../lib/network.ts';
import { CliError, mark } from '../lib/output.ts';
import { BUILD_MARKER, guardOutputDir } from '../lib/output-guard.ts';
import { parsePort } from '../lib/ports.ts';
import { buildIndex } from '../lib/registry.ts';
import { serveStatic } from '../lib/static-server.ts';
import { workspaceFile } from '../lib/workspace-file.ts';
import { buildGallery } from './showcase.ts';

/** Where `gallery build` writes and `gallery preview` serves, unless `--out` says otherwise. */
export const GALLERY_OUT = join('artifacts', 'gallery', 'dist');

function normalizeBase(value: string | undefined): string {
  const base = value ?? '/';
  if (!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(base)) {
    throw new CliError(
      'usage',
      `--base must be an absolute path that ends with "/", got "${base}".`
    );
  }
  return base;
}

/**
 * `protoyard gallery build`: the installed (or this repository's) Astro gallery
 * as a static site for this workspace's registry, written outside the package
 * (`artifacts/gallery/dist/`, never into node_modules). It lists the
 * workspace's prototypes and templates and serves the guides at `/docs/`.
 * The showcase (`protoyard showcase`) also bundles each prototype's build.
 */
export const galleryBuildCommand: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  const base = normalizeBase(opt(options, 'base'));
  // The folder is emptied before the build: guardOutputDir refuses the
  // workspace, its sources and any folder Protoyard did not write.
  const out = guardOutputDir({
    root: ctx.root,
    paths: ctx.paths,
    requested: opt(options, 'out') ?? GALLERY_OUT,
    marker: BUILD_MARKER,
  });
  const index = await buildIndex(ctx.paths);
  await rm(out, { recursive: true, force: true });
  ctx.out.info('Building the gallery…');
  const result = await buildGallery(
    ctx,
    out,
    ctx.paths.registry,
    base,
    !flag(options, 'verbose'),
    opt(options, 'site'),
    false
  );
  if (result.code !== 0 || !existsSync(join(out, 'index.html'))) {
    throw new CliError('failure', `Gallery build failed (exit ${result.code}).`, {
      hint: result.log.trim().split('\n').slice(-10).join('\n') || 'Run with --verbose.',
    });
  }
  await writeFile(join(out, BUILD_MARKER), '{"kind":"gallery"}\n', 'utf8');
  const data = {
    out: relative(ctx.root, out),
    base,
    entries: index.registry.entries.length,
    docs: existsSync(join(out, 'docs', 'index.html')),
  };
  return {
    data,
    render(o) {
      o.always(`${mark(o.c, 'pass')} Gallery built in ${data.out} (${data.entries} entries)`);
      o.info(o.c.dim('  Preview: protoyard gallery preview'));
    },
  };
};

/** `protoyard gallery preview`: serves the built gallery like a static host. */
export const galleryPreviewCommand: Handler = async (
  ctx,
  _args,
  options
): Promise<CommandResult> => {
  const dir = workspaceFile(ctx.root, opt(options, 'out') ?? GALLERY_OUT);
  if (!existsSync(join(dir, 'index.html'))) {
    throw new CliError('not_found', 'The gallery has not been built yet.', {
      hint: 'Run `protoyard gallery build` first.',
    });
  }
  const base = normalizeBase(opt(options, 'base'));
  const host = flag(options, 'host') ? '0.0.0.0' : '127.0.0.1';
  const requested = parsePort(opt(options, 'port'), 4322);
  const server = await serveStatic({ dir, base, port: requested, host, spa: false });
  const lan =
    host === '0.0.0.0' ? lanAddresses().map((ip) => `http://${ip}:${server.port}${base}`) : [];
  return {
    data: { url: server.url, port: server.port, lan, base },
    render(o) {
      o.always(`${mark(o.c, 'pass')} Serving the gallery at ${o.c.cyan(server.url)}`);
      for (const url of lan) o.always(`  LAN: ${o.c.cyan(url)}`);
      o.info(o.c.dim('  Ctrl+C to stop.'));
    },
    keepAlive: untilSignal(() => server.close()),
  };
};
