import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { buildPrototype, scanForForeignCode } from '../lib/build.ts';
import { digestDirectory } from '../lib/checksum.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { lanAddresses, untilSignal } from '../lib/network.ts';
import { CliError, formatBytes, mark, toCliError } from '../lib/output.ts';
import { isInside, toPosixRelative } from '../lib/paths.ts';
import { parsePort } from '../lib/ports.ts';
import { resolvePackageBin } from '../lib/process.ts';
import { buildIndex, type Registry, type RegistryEntry, writeJsonAtomic } from '../lib/registry.ts';
import { serveStatic } from '../lib/static-server.ts';
import { normalizeBase } from '../lib/vite.ts';
import type { CommandContext } from '../lib/workspace.ts';

/**
 * `protoyard showcase` builds ONE static site: the gallery plus every
 * prototype's own static build at `<base>p/<slug>/app/` (templates at
 * `<base>t/<name>/app/` with --include-templates). The gallery learns which
 * builds are bundled from an `embedded` flag in a showcase-only copy of the
 * registry, so hosted previews and "Open" links work with no control server.
 *
 * Each prototype is still built in isolation (its own Vite process and
 * config) and must pass the same isolation check as `export`.
 */

export interface ShowcaseTarget {
  kind: RegistryEntry['kind'];
  slug: string;
  /** Site-relative app path, e.g. `p/crm-demo/app/`. */
  appPath: string;
  ok: boolean;
  bytes?: number;
  durationMs: number;
  error?: string;
}

export function appPathFor(entry: Pick<RegistryEntry, 'kind' | 'slug'>): string {
  return `${entry.kind === 'template' ? 't' : 'p'}/${entry.slug}/app/`;
}

/** The registry the showcase gallery is built from: only successful builds are marked embedded. */
export function showcaseRegistry(registry: Registry, targets: readonly ShowcaseTarget[]): Registry {
  const embedded = new Map(
    targets.filter((t) => t.ok).map((t) => [`${t.kind}:${t.slug}`, t.appPath])
  );
  return {
    ...registry,
    entries: registry.entries.map((entry) => {
      const url = embedded.get(`${entry.kind}:${entry.slug}`);
      return url ? { ...entry, embedded: { url, scenarioLinks: true } } : entry;
    }),
  } as Registry;
}

function resolveShowcaseOut(ctx: CommandContext, out: string | undefined): string {
  const target = resolve(ctx.root, out ?? join('artifacts', 'showcase'));
  const forbidden = [
    ctx.root,
    ctx.paths.prototypes,
    ctx.paths.templates,
    join(ctx.root, 'packages'),
    join(ctx.root, 'apps'),
  ];
  for (const dir of forbidden) {
    if (isInside(target, dir) || (dir !== ctx.root && isInside(dir, target))) {
      throw new CliError(
        'unsafe_path',
        `Refusing --out ${target}: it would overwrite source files.`
      );
    }
  }
  return target;
}

function buildGallery(
  ctx: CommandContext,
  outDir: string,
  registryPath: string,
  base: string,
  quiet: boolean
) {
  const galleryDir = join(ctx.root, 'apps', 'gallery');
  const astro = resolvePackageBin('astro', 'astro', [galleryDir, ctx.root]);
  if (!astro)
    throw new CliError('not_found', 'Astro is not installed.', { hint: 'Run `pnpm install`.' });
  return new Promise<{ code: number; log: string }>((resolvePromise) => {
    let log = '';
    const child = spawn(process.execPath, [astro, 'build', '--outDir', outDir], {
      cwd: galleryDir,
      env: {
        ...process.env,
        PROTOYARD_REGISTRY: registryPath,
        GALLERY_BASE: base,
        PROTOYARD_SHOWCASE: '1',
      },
      shell: false,
      stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    const collect = (chunk: Buffer) => {
      log = (log + chunk.toString()).slice(-8000);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.on('error', (error) => resolvePromise({ code: 127, log: error.message }));
    child.on('close', (code) => resolvePromise({ code: code ?? 1, log }));
  });
}

async function serve(dir: string, base: string, options: Record<string, unknown>) {
  const host = flag(options, 'host') ? '0.0.0.0' : '127.0.0.1';
  return serveStatic({
    dir,
    base,
    host,
    port: parsePort(opt(options, 'port'), 4500),
    strictPort: flag(options, 'strictPort'),
    spa: false,
  });
}

export const showcaseCommand: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  const base = normalizeBase(opt(options, 'base') ?? '/');
  if (base === './') {
    throw new CliError(
      'usage',
      'A showcase needs an absolute --base such as "/" or "/protoyard/".'
    );
  }
  const out = resolveShowcaseOut(ctx, opt(options, 'out'));
  const quiet = ctx.out.options.json || ctx.out.options.quiet;

  if (flag(options, 'skipBuild')) {
    if (!existsSync(join(out, 'index.html'))) {
      throw new CliError('not_found', `No showcase at ${toPosixRelative(ctx.root, out)}.`, {
        hint: 'Run without --skip-build first.',
      });
    }
    if (!flag(options, 'serve'))
      throw new CliError('usage', '--skip-build only makes sense with --serve.');
    const server = await serve(out, base, options);
    return {
      data: { out: toPosixRelative(ctx.root, out), url: server.url, built: false },
      render: (o) =>
        o.always(`${mark(o.c, 'pass')} Serving the showcase at ${o.c.cyan(server.url)}`),
      keepAlive: untilSignal(() => server.close()),
    };
  }

  const { registry } = await buildIndex(ctx.paths);
  const entries = registry.entries.filter(
    (e) => e.kind === 'prototype' || (flag(options, 'includeTemplates') && e.kind === 'template')
  );
  const includeDevtools = options.devtools !== false;
  const staging = `${out}.staging-${process.pid}`;
  const appsStaging = `${out}.apps-${process.pid}`;
  await rm(staging, { recursive: true, force: true });
  await rm(appsStaging, { recursive: true, force: true });

  const targets: ShowcaseTarget[] = [];
  try {
    // 1. Every prototype, sequentially, each with its final public base.
    for (const entry of entries) {
      const appPath = appPathFor(entry);
      const started = performance.now();
      ctx.out.info(`Building ${ctx.out.c.bold(entry.slug)} → ${base}${appPath}`);
      try {
        const appOut = join(appsStaging, appPath);
        const result = await buildPrototype(ctx, entry, join(ctx.root, entry.path), {
          base: `${base}${appPath}`,
          includeDevtools,
          out: appOut,
          manifestPath: join(
            ctx.paths.artifacts,
            'showcase-builds',
            `${entry.kind}-${entry.slug}.json`
          ),
        });
        const foreign = await scanForForeignCode(result.outDir, entry, registry.entries);
        if (foreign.length > 0) {
          throw new CliError(
            'validation',
            `bundle references ${foreign.map((f) => f.slug).join(', ')}`
          );
        }
        targets.push({
          kind: entry.kind,
          slug: entry.slug,
          appPath,
          ok: true,
          bytes: result.manifest.totalBytes,
          durationMs: Math.round(performance.now() - started),
        });
      } catch (error) {
        targets.push({
          kind: entry.kind,
          slug: entry.slug,
          appPath,
          ok: false,
          durationMs: Math.round(performance.now() - started),
          error: toCliError(error).message,
        });
      }
    }

    // 2. The gallery, from a showcase registry that marks the bundled builds.
    // It lives in the workspace's .protoyard/ so thumbnail paths still resolve.
    const registryPath = join(ctx.paths.state, 'showcase-registry.json');
    await writeJsonAtomic(registryPath, showcaseRegistry(registry, targets));
    ctx.out.info('Building the gallery…');
    const gallery = await buildGallery(ctx, staging, registryPath, base, quiet);
    if (gallery.code !== 0) {
      throw new CliError('failure', `Gallery build failed (exit ${gallery.code}).`, {
        hint: gallery.log.trim().split('\n').slice(-10).join('\n') || 'See the output above.',
      });
    }

    // 3. Move each app under its detail page folder, then swap the site in.
    for (const target of targets.filter((t) => t.ok)) {
      const destination = join(staging, target.appPath);
      await mkdir(dirname(destination), { recursive: true });
      await rename(join(appsStaging, target.appPath), destination);
    }
    await rm(out, { recursive: true, force: true });
    await mkdir(dirname(out), { recursive: true });
    await rename(staging, out);
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(appsStaging, { recursive: true, force: true });
  }

  const files = await digestDirectory(out);
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const summary = {
    out: toPosixRelative(ctx.root, out),
    base,
    includeDevtools,
    files: files.length,
    totalBytes,
    targets,
  };
  await writeJsonAtomic(join(ctx.paths.artifacts, 'showcase-builds', 'showcase.json'), {
    ...summary,
    builtAt: new Date().toISOString(),
  });

  const failed = targets.filter((t) => !t.ok);
  const server = flag(options, 'serve') ? await serve(out, base, options) : null;
  const lan =
    server && flag(options, 'host')
      ? lanAddresses().map((ip) => `http://${ip}:${server.port}${base}`)
      : [];
  return {
    data: { ...summary, ...(server ? { url: server.url, lan } : {}) },
    ...(failed.length > 0
      ? {
          failure: new CliError(
            'failure',
            `${failed.length} of ${targets.length} prototype build(s) failed; they are listed without a live demo.`
          ),
        }
      : {}),
    render(o) {
      const { c } = o;
      for (const t of targets) {
        o.always(
          `${mark(c, t.ok ? 'pass' : 'fail')} ${t.slug.padEnd(28)} ${t.ok ? c.dim(`${base}${t.appPath} · ${formatBytes(t.bytes ?? 0)}`) : c.red(t.error ?? '')}`
        );
      }
      o.always(
        `${mark(c, failed.length ? 'warn' : 'pass')} Showcase → ${c.cyan(summary.out)} (${files.length} files, ${formatBytes(totalBytes)}, base ${base}, DevTools ${includeDevtools ? 'included' : 'excluded'})`
      );
      if (server) {
        o.always(`  Serving at ${c.cyan(server.url)}`);
        for (const url of lan) o.always(`  LAN: ${c.cyan(url)}`);
      } else {
        o.info(
          `  Try it: ${c.cyan(`pnpm protoyard showcase --skip-build --serve${base === '/' ? '' : ` --base ${base}`}`)}`
        );
        o.info(
          c.dim('  Upload the folder to any static host that serves it at the same base path.')
        );
      }
    },
    ...(server ? { keepAlive: untilSignal(() => server.close()) } : {}),
  };
};
