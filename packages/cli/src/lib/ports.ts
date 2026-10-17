import { createServer, Socket } from 'node:net';

/** True when nothing is listening on host:port and we may bind it. */
export function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once('error', () => resolvePromise(false));
    server.once('listening', () => server.close(() => resolvePromise(true)));
    server.listen(port, host);
  });
}

/** First free port at or after `preferred` (within `span` attempts). */
export async function findFreePort(preferred: number, host = '127.0.0.1', span = 50) {
  for (let port = preferred; port < preferred + span && port <= 65535; port++) {
    if (await isPortFree(port, host)) return port;
  }
  throw new Error(`No free port found in ${preferred}-${preferred + span - 1}.`);
}

/** Resolves when a TCP connection to host:port succeeds, or rejects on timeout. */
export async function waitForPort(port: number, host = '127.0.0.1', timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const open = await new Promise<boolean>((resolvePromise) => {
      const socket = new Socket();
      socket.setTimeout(500);
      socket.once('connect', () => {
        socket.destroy();
        resolvePromise(true);
      });
      socket.once('error', () => resolvePromise(false));
      socket.once('timeout', () => {
        socket.destroy();
        resolvePromise(false);
      });
      socket.connect(port, host);
    });
    if (open) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for ${host}:${port}.`);
}

export function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port "${value}" (expected 1-65535).`);
  }
  return port;
}
