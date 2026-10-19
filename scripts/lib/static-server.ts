import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, sep } from 'node:path';

/** Content types for what a prototype build or the showcase contains. */
export const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

export interface StaticServer {
  server: Server;
  /** `http://127.0.0.1:<port>` */
  origin: string;
  close(): Promise<void>;
}

/**
 * Serves one folder on a free loopback port and never anything outside it,
 * symlinks included. Unknown paths fall back to the nearest `index.html`
 * (the folder's own for a showcase app, else the root one), like a static
 * host serving hash-routed apps.
 */
export function serveDirectory(dir: string): Promise<StaticServer> {
  const root = realpathSync(dir);
  const inside = (path: string) => path === root || path.startsWith(root + sep);
  const server = createServer((req, res) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    let file = join(root, normalize(pathname).replace(/^([/\\])+/, ''));
    if (!inside(file)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) file = join(root, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    // Resolve symlinks too: a link inside the folder must not serve files from elsewhere.
    if (!inside(realpathSync(file))) {
      res.writeHead(403).end();
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(readFileSync(file));
  });
  return new Promise((done) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      done({
        server,
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((closed) => server.close(() => closed())),
      });
    })
  );
}
