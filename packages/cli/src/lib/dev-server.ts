import type { ChildProcess } from 'node:child_process';
import { lanAddresses } from './network.ts';
import { CliError } from './output.ts';
import { findFreePort, waitForPort } from './ports.ts';
import { spawnViteDev } from './vite.ts';

export const DEFAULT_DEV_PORT = 5173;

export interface DevServerHandle {
  slug: string;
  port: number;
  url: string;
  lan: string[];
  startedAt: string;
  child: ChildProcess;
  /** Resolves with the exit code when the Vite process ends. */
  exited: Promise<number>;
  stop(): Promise<void>;
}

/**
 * Starts Vite for ONE prototype on a free port and resolves once it accepts
 * connections. The port is chosen here and passed with --strictPort, so the
 * URL we print is the URL Vite actually serves.
 */
export async function startDevServer(options: {
  root: string;
  dir: string;
  slug: string;
  port?: number;
  host?: boolean;
  stdio: 'inherit' | 'pipe';
  readyTimeoutMs?: number;
  /**
   * Overrides the prototype/template storage namespace for this dev session
   * (template live demos use `template-demo-<name>`).
   */
  storageNamespace?: string;
}): Promise<DevServerHandle> {
  const bindHost = options.host ? '0.0.0.0' : '127.0.0.1';
  const port = await findFreePort(options.port ?? DEFAULT_DEV_PORT, bindHost);
  const child = spawnViteDev({
    dir: options.dir,
    root: options.root,
    port,
    host: Boolean(options.host),
    stdio: options.stdio,
    ...(options.storageNamespace ? { storageNamespace: options.storageNamespace } : {}),
  });
  let log = '';
  const collect = (chunk: Buffer) => {
    log = (log + chunk.toString()).slice(-8000);
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);
  const exited = new Promise<number>((resolvePromise) => {
    child.once('exit', (code, signal) => resolvePromise(code ?? (signal ? 0 : 1)));
    child.once('error', () => resolvePromise(127));
  });
  const failedEarly = exited.then((code) => {
    throw new CliError('failure', `Vite exited (code ${code}) before ${options.slug} was ready.`, {
      hint: log.trim().split('\n').slice(-10).join('\n') || 'See the Vite output above.',
    });
  });
  try {
    await Promise.race([
      waitForPort(port, '127.0.0.1', options.readyTimeoutMs ?? 60_000),
      failedEarly,
    ]);
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
  failedEarly.catch(() => {
    // Exit after readiness is reported through `exited`, not as an error.
  });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    await exited;
    clearTimeout(timer);
  };
  return {
    slug: options.slug,
    port,
    url: `http://localhost:${port}/`,
    lan: options.host ? lanAddresses().map((ip) => `http://${ip}:${port}/`) : [],
    startedAt: new Date().toISOString(),
    child,
    exited,
    stop,
  };
}
