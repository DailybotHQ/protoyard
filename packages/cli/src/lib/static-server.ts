import { createServer, type Server } from 'node:http';
import sirv from 'sirv';
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
}): Promise<StaticServer> {
  const prefix = options.base === './' ? '/' : options.base;
  const handler = sirv(options.dir, { single: true, dev: true, etag: true });
  const server = createServer((req, res) => {
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
    handler(req, res, () => {
      res.writeHead(404);
      res.end();
    });
  });
  const port = options.strictPort ? options.port : await findFreePort(options.port, options.host);
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, options.host, () => resolvePromise());
  });
  const displayHost = options.host === '0.0.0.0' ? 'localhost' : options.host;
  return {
    server,
    port,
    url: `http://${displayHost}:${port}${prefix}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
