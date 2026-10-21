import { createReadStream, existsSync, realpathSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import sirv from 'sirv';
import { isInside } from './paths.ts';
import { findFreePort } from './ports.ts';

export interface StaticServer {
  server: Server;
  port: number;
  url: string;
  close(): Promise<void>;
}

/** Extensions sirv tries, in its order ('' = the path as given). */
const SIRV_EXTENSIONS = ['', 'html', 'htm'];

/** sirv's `toAssume` (v3): `uri`, `uri/index`, then each with every extension. */
function assume(uri: string): string[] {
  const trimmed = uri.endsWith('/') ? uri.slice(0, -1) : uri;
  const out: string[] = [];
  for (const ext of SIRV_EXTENSIONS) {
    const suffix = ext ? `.${ext}` : '';
    if (trimmed) out.push(trimmed + suffix);
    out.push(`${trimmed}/index${suffix}`);
  }
  return out;
}

/**
 * Every path sirv may serve for a request: its own lookups and, in SPA
 * mode, the root fallback (`/index`, `/index.html`, `/index.htm`). Kept in
 * lock-step with sirv so the containment check covers each one.
 */
export function sirvCandidates(pathname: string, spa: boolean): string[] {
  return spa ? [...assume(pathname), ...assume('/')] : assume(pathname);
}

/**
 * Serves a built prototype like a static host would, including the SPA
 * fallback and an absolute `base` (assets live under `/sub/path/`).
 */
export async function serveStatic(options: {
  dir: string;
  base: string;
  port: number;
  host: string;
  strictPort?: boolean;
  /** SPA fallback to index.html (default). Multi-page sites use 404.html instead. */
  spa?: boolean;
  /** Optional same-origin route handled before static files (for example a local comments API). */
  route?: (request: IncomingMessage, response: ServerResponse) => boolean;
  /** Optional allowlist applied to decoded request paths before static lookup. */
  allowPathname?: (pathname: string) => boolean;
  /** Optional Host allowlist for loopback servers that must resist DNS rebinding. */
  allowHost?: (host: string) => boolean;
}): Promise<StaticServer> {
  const prefix = options.base === './' ? '/' : options.base;
  const spa = options.spa ?? true;
  // sirv's default lookups (`/about` → about.html, `/docs/` → docs/index.html)
  // stay on; each one is checked for containment below.
  const handler = sirv(options.dir, { single: spa, dev: true, etag: true });
  const notFoundPage = join(options.dir, '404.html');
  const realRoot = realpathSync.native(options.dir);
  const server = createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (options.allowHost && !options.allowHost(req.headers.host ?? '')) {
      res.writeHead(421, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Misdirected request.');
      return;
    }
    if (options.route?.(req, res)) return;
    const url = req.url ?? '/';
    if (prefix !== '/') {
      if (url === '/' || url === prefix.slice(0, -1)) {
        res.writeHead(302, { Location: prefix });
        res.end();
        return;
      }
      if (!url.startsWith(prefix)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Not found. This build is served under ${prefix}`);
        return;
      }
      req.url = url.slice(prefix.length - 1);
    }
    // Decode exactly like sirv (decodeURI keeps %2F encoded), so the paths
    // checked below are the paths sirv will open.
    let pathname = (req.url ?? '/').split(/[?#]/)[0] || '/';
    if (pathname.includes('%')) {
      try {
        pathname = decodeURI(pathname);
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad request: malformed URL escape.');
        return;
      }
    }
    if (options.allowPathname && !options.allowPathname(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found.');
      return;
    }
    // Containment on the REAL path of every file sirv might answer with: a
    // symlink inside the folder must never serve a file from elsewhere.
    for (const candidate of sirvCandidates(pathname, spa)) {
      const file = join(options.dir, candidate);
      if (!existsSync(file)) continue;
      let real = '';
      try {
        real = realpathSync.native(file);
      } catch {
        real = '';
      }
      if (!real || !isInside(realRoot, real)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden.');
        return;
      }
    }
    handler(req, res, () => {
      if (!spa && existsSync(notFoundPage)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        createReadStream(notFoundPage).pipe(res);
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  const port = options.strictPort ? options.port : await findFreePort(options.port, options.host);
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, options.host, () => resolvePromise());
  });
  // Port 0 asks the OS for any free port: report the one actually bound.
  const address = server.address();
  const boundPort = address && typeof address === 'object' ? address.port : port;
  const displayHost = options.host === '0.0.0.0' ? 'localhost' : options.host;
  return {
    server,
    port: boundPort,
    url: `http://${displayHost}:${boundPort}${prefix}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
