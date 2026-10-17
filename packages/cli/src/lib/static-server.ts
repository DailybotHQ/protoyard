import { createReadStream, existsSync, realpathSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
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
}): Promise<StaticServer> {
  const prefix = options.base === './' ? '/' : options.base;
  const spa = options.spa ?? true;
  const handler = sirv(options.dir, { single: spa, dev: true, etag: true });
  const notFoundPage = join(options.dir, '404.html');
  const realRoot = realpathSync.native(options.dir);
  const server = createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const url = req.url ?? '/';
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.split('?')[0] ?? '/');
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad request: malformed URL escape.');
      return;
    }
    // Containment on the REAL path: a symlink inside dist must not serve a
    // file from elsewhere on disk.
    const relativePath = (
      prefix !== '/' && pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname
    ).replace(/^\/+/, '');
    const candidate = join(options.dir, relativePath);
    if (relativePath && existsSync(candidate)) {
      let real: string;
      try {
        real = realpathSync.native(candidate);
      } catch {
        real = '';
      }
      if (!real || !isInside(realRoot, real)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden.');
        return;
      }
    }
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
