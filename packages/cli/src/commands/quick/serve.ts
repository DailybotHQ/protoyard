import { spawn } from 'node:child_process';
import { existsSync, lstatSync, statSync } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { blueprintIdentity, parseBlueprint } from '@protoyard/blueprint';
import { checkSlug } from '@protoyard/core';
import { handleCommentsRequest } from '@protoyard/review/server';
import type { CommandResult, Handler } from '../../lib/command.ts';
import { flag, opt } from '../../lib/command.ts';
import { untilSignal } from '../../lib/network.ts';
import { CliError, mark } from '../../lib/output.ts';
import { QUICK_MARKER } from '../../lib/output-guard.ts';
import { canonicalPath, toPosixRelative } from '../../lib/paths.ts';
import { parsePort } from '../../lib/ports.ts';
import { createFileCommentsStore } from '../../lib/quick/comments-store.ts';
import { readQuickRecord } from '../../lib/quick/model.ts';
import { QUICK_PLAYER_DIR, quickPlayerDir, resolveQuickBase } from '../../lib/quick/paths.ts';
import { type StaticServer, serveStatic } from '../../lib/static-server.ts';

/**
 * `protoyard quick serve <dir|slug> [--port] [--strict-port] [--open]`: serves
 * an exploration on 127.0.0.1 until Ctrl+C, so its launcher and the player
 * run over http (IndexedDB, workers and the service worker need an origin,
 * not file://). Only folders an earlier `protoyard quick` wrote (with the
 * `.protoyard-quick` marker and a valid quick.json) are served.
 *
 * A shared-player exploration links to `../_player/<version>/`, so the
 * server's root is the quick zone and the URL is `/<slug>/`; a standalone
 * exploration (its own `player/`) is served from its own folder at `/`.
 */

/** First port tried; like `preview`, a busy port falls back to the next free one. */
export const QUICK_SERVE_DEFAULT_PORT = 4180;

export interface QuickServeTarget {
  slug: string;
  /** Canonical exploration folder. */
  dir: string;
  /** Folder the server serves: the quick zone (shared player) or the exploration itself. */
  root: string;
  /** Path of the exploration's launcher on the server, ending in `/`. */
  path: string;
  layout: 'shared' | 'standalone';
  playerVersion: string;
  /** Content-derived slugs used by review comments for this exploration and its variants. */
  reviewSlugs: string[];
}

async function reviewSlugForBlueprint(path: string, expectedSha256: string): Promise<string> {
  const info = await lstat(path).catch(() => undefined);
  if (!info?.isFile() || info.isSymbolicLink() || info.size > 2 * 1024 * 1024) {
    throw new CliError('unsafe_path', 'Refusing a missing, linked or oversized quick blueprint.');
  }
  let blueprint: ReturnType<typeof parseBlueprint>;
  try {
    blueprint = parseBlueprint(JSON.parse(await readFile(path, 'utf8')) as unknown);
  } catch {
    throw new CliError('validation', 'The quick blueprint is invalid; recreate the exploration.');
  }
  const identity = await blueprintIdentity(blueprint);
  if (identity.sha256 !== expectedSha256) {
    throw new CliError('validation', 'The quick blueprint changed after it was created.');
  }
  return identity.namespace;
}

/** Resolves `<dir|slug>` to a marked exploration and what to serve; throws a CliError. */
export async function resolveQuickServeTarget(input: {
  workspaceRoot: string | null;
  cwd: string;
  target: string;
}): Promise<QuickServeTarget> {
  const { target } = input;
  if (!target) {
    throw new CliError('usage', 'Name the exploration to serve: a slug or its folder.', {
      hint: 'protoyard quick serve <slug>   or   protoyard quick serve ./path/to/exploration',
    });
  }
  const looksLikeSlug = !/[\\/]/.test(target) && target !== '.' && target !== '..';
  const requested =
    looksLikeSlug && checkSlug(target).ok
      ? join(resolveQuickBase({ workspaceRoot: input.workspaceRoot, cwd: input.cwd }).zone, target)
      : resolve(input.cwd, target);
  if (!existsSync(requested) || !statSync(requested).isDirectory()) {
    throw new CliError('not_found', `No exploration at ${requested}.`, {
      hint: 'Create one with `protoyard quick "<brief>"`, or pass the folder it printed.',
    });
  }
  if (lstatSync(requested).isSymbolicLink()) {
    throw new CliError('unsafe_path', `Refusing to serve ${requested}: it is a symbolic link.`);
  }
  const dir = canonicalPath(requested);
  if (!existsSync(join(dir, QUICK_MARKER))) {
    throw new CliError(
      'unsafe_path',
      `Refusing to serve ${dir}: it is not an exploration (no ${QUICK_MARKER}).`,
      { hint: 'Only folders written by `protoyard quick` are served.' }
    );
  }
  const record = await readQuickRecord(dir);
  const reviewSlugs = [
    await reviewSlugForBlueprint(join(dir, 'blueprint.json'), record.blueprintSha256),
    ...(await Promise.all(
      record.variants.map((variant) =>
        reviewSlugForBlueprint(join(dir, variant.dir, 'blueprint.json'), variant.blueprintSha256)
      )
    )),
  ];
  const version = record.player.version;
  if (record.player.standalone) {
    if (!existsSync(join(dir, 'player', 'index.html'))) {
      throw new CliError(
        'not_found',
        `The exploration's own player is missing in ${dir}/player/.`,
        {
          hint: 'Recreate it with `protoyard quick … --force --standalone`.',
        }
      );
    }
    return {
      slug: record.slug,
      dir,
      root: dir,
      path: '/',
      layout: 'standalone',
      playerVersion: version,
      reviewSlugs,
    };
  }
  const zone = dirname(dir);
  if (!existsSync(join(quickPlayerDir(zone, version), 'index.html'))) {
    throw new CliError(
      'not_found',
      `The shared player ${version} is missing (${join(zone, QUICK_PLAYER_DIR, version)}).`,
      {
        hint: 'Run `protoyard quick` again for this exploration, or recreate it with --standalone.',
      }
    );
  }
  return {
    slug: record.slug,
    dir,
    root: zone,
    path: `/${encodeURIComponent(basename(dir))}/`,
    layout: 'shared',
    playerVersion: version,
    reviewSlugs,
  };
}

/** Opens a URL in the default browser, detached. Tests swap it. */
let openUrl = (url: string): void => {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(command as string, args as string[], {
      stdio: 'ignore',
      detached: true,
      shell: false,
    });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // No browser launcher: the URL is printed anyway.
  }
};
export function setQuickServeOpener(opener: (url: string) => void): () => void {
  const previous = openUrl;
  openUrl = opener;
  return () => {
    openUrl = previous;
  };
}

/** Resolves when the server should stop (Ctrl+C by default). Tests swap it. */
let waitForStop = (stop: () => Promise<void>): Promise<void> => untilSignal(stop);
export function setQuickServeStop(wait: (stop: () => Promise<void>) => Promise<void>): () => void {
  const previous = waitForStop;
  waitForStop = wait;
  return () => {
    waitForStop = previous;
  };
}

export interface QuickServeResult {
  slug: string;
  dir: string;
  /** The launcher: open it to play the exploration. */
  url: string;
  port: number;
  /** Folder served, relative to the workspace (or absolute outside one). */
  root: string;
  layout: 'shared' | 'standalone';
  playerVersion: string;
  opened: boolean;
}

export const quickServeCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const target = await resolveQuickServeTarget({
    workspaceRoot: ctx.root,
    cwd: process.cwd(),
    target: args[0] ?? '',
  });
  let requested: number;
  try {
    requested = parsePort(opt(options, 'port'), QUICK_SERVE_DEFAULT_PORT);
  } catch (error) {
    throw new CliError('usage', (error as Error).message);
  }
  let server: StaticServer;
  let boundPort: number | undefined;
  const commentsStore = createFileCommentsStore(target.dir, target.reviewSlugs);
  try {
    server = await serveStatic({
      dir: target.root,
      base: '/',
      port: requested,
      host: '127.0.0.1',
      strictPort: flag(options, 'strictPort'),
      // An exploration is a set of files, not a single-page app: unknown paths are 404s.
      spa: false,
      allowHost: (host) => boundPort !== undefined && host === `127.0.0.1:${boundPort}`,
      allowPathname: (pathname) => {
        if (target.layout === 'standalone') return pathname.startsWith('/');
        if (!pathname.startsWith('/')) return false;
        const parts = pathname.slice(1).split('/');
        if (parts.at(-1) === '') parts.pop();
        if (parts.some((part) => part === '' || part === '.' || part === '..')) return false;
        return (
          pathname.startsWith(`/${target.slug}/`) ||
          pathname.startsWith(`/${QUICK_PLAYER_DIR}/${target.playerVersion}/`)
        );
      },
      route: (request, response) => {
        let url: URL;
        try {
          url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
        } catch {
          return false;
        }
        if (!url.pathname.startsWith('/api/comments')) return false;
        const parts = url.pathname.split('/').filter(Boolean);
        let routeSlug = '';
        try {
          routeSlug = decodeURIComponent(parts[2] ?? '');
        } catch {
          routeSlug = '';
        }
        if (
          parts[0] !== 'api' ||
          parts[1] !== 'comments' ||
          !target.reviewSlugs.includes(routeSlug)
        ) {
          response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(
            JSON.stringify({
              ok: false,
              error: { code: 'not_found', message: 'Comments route not found.' },
            })
          );
          return true;
        }
        void (async () => {
          const requestHeaders = new Headers();
          for (const [name, value] of Object.entries(request.headers)) {
            if (value !== undefined)
              requestHeaders.set(name, Array.isArray(value) ? value.join(', ') : value);
          }
          const method = request.method ?? 'GET';
          const body = method === 'GET' || method === 'HEAD' ? undefined : Readable.toWeb(request);
          const webRequest = new Request(url, {
            method,
            headers: requestHeaders,
            ...(body ? { body, duplex: 'half' } : {}),
          } as RequestInit);
          const result = await handleCommentsRequest(webRequest, {}, commentsStore);
          const headers: Record<string, string> = {};
          result.headers.forEach((value, name) => {
            headers[name] = value;
          });
          response.writeHead(result.status, headers);
          response.end(Buffer.from(await result.arrayBuffer()));
        })().catch(() => {
          if (!response.headersSent) {
            response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          }
          response.end(
            JSON.stringify({
              ok: false,
              error: {
                code: 'internal_error',
                message: 'Comments request could not be completed.',
              },
            })
          );
        });
        return true;
      },
    });
    boundPort = server.port;
  } catch (error) {
    throw new CliError(
      'conflict',
      `Could not serve on port ${requested}: ${(error as Error).message}`,
      {
        hint: 'Pick another --port, or drop --strict-port to use the next free one.',
      }
    );
  }
  const url = `http://127.0.0.1:${server.port}${target.path}`;
  const open = flag(options, 'open');
  if (open) openUrl(url);
  const rel = (path: string) => toPosixRelative(ctx.root, path);
  const data: QuickServeResult = {
    slug: target.slug,
    dir: rel(target.dir),
    url,
    port: server.port,
    root: rel(target.root),
    layout: target.layout,
    playerVersion: target.playerVersion,
    opened: open,
  };
  return {
    data,
    render(out) {
      const { c } = out;
      out.always(`${mark(c, 'pass')} Serving ${c.bold(target.slug)} on ${c.cyan(url)}`);
      if (server.port !== requested)
        out.info(c.dim(`  Port ${requested} was busy; using ${server.port}.`));
      out.info(c.dim(`  Local only (127.0.0.1). Simulated data. Press Ctrl+C to stop.`));
    },
    keepAlive: waitForStop(() => server.close()),
  };
};
