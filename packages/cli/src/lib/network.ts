import { networkInterfaces } from 'node:os';

/** Private IPv4 addresses, so `--host` can print a URL a phone on the same Wi-Fi can open. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family === 'IPv4' && !item.internal) out.push(item.address);
    }
  }
  return out;
}

/** Resolves on SIGINT/SIGTERM so long-running commands can clean up. */
export function untilSignal(cleanup: () => Promise<void> | void): Promise<void> {
  return new Promise((resolvePromise) => {
    const stop = async () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      await cleanup();
      resolvePromise();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}
