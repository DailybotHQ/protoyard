/**
 * Serves a static build folder on 127.0.0.1 for E2E (same server as
 * `protoyard preview`, without requiring the build to live in
 * artifacts/<slug>/dist). Usage: tsx tests/e2e/support/serve-static.ts <dir> <port>
 */
import { resolve } from 'node:path';
import { serveStatic } from '../../../packages/cli/src/lib/static-server.ts';

const [dir, port] = process.argv.slice(2);
if (!dir || !port || !/^\d+$/.test(port)) {
  console.error('usage: serve-static.ts <dir> <port>');
  process.exit(2);
}
const server = await serveStatic({
  dir: resolve(dir),
  base: './',
  port: Number(port),
  host: '127.0.0.1',
  strictPort: true,
});
console.log(`Serving ${dir} at ${server.url}`);
