import { safePreviewUrl } from './devices';

/**
 * Client for the local control server started by `pnpm dev`
 * (packages/cli/src/control-server.ts). On a static deployment there is no
 * server: detection fails fast and the gallery stays read-only.
 */

const DEFAULT_URL = 'http://127.0.0.1:4300';
const DETECT_TIMEOUT_MS = 800;

export interface RunningServer {
  slug: string;
  url: string;
  port: number;
  startedAt: string;
}

type Status = 'unknown' | 'checking' | 'available' | 'unavailable';

/**
 * Dev servers started by the control server always listen on this machine.
 * Anything else (another host, a javascript: URL) is never framed or linked.
 */
export function localDevUrl(input: string): string | null {
  const url = safePreviewUrl(input);
  if (!url) return null;
  const host = new URL(url).hostname;
  return ['localhost', '127.0.0.1', '[::1]'].includes(host) ? url : null;
}

async function fetchJson(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 60_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok && body.ok === true, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

class ControlClient {
  status = $state<Status>('unknown');
  running = $state<RunningServer[]>([]);
  /** Slug → in-flight action, for button states. */
  busy = $state<Record<string, 'starting' | 'stopping'>>({});
  errors = $state<Record<string, string>>({});
  readonly baseUrl: string;

  constructor() {
    this.baseUrl = (import.meta.env.PUBLIC_PROTOYARD_CONTROL_URL ?? DEFAULT_URL).replace(/\/$/, '');
  }

  /** Only worth probing when the gallery itself is served from this machine. */
  get isLocalPage() {
    return ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  }

  async detect() {
    if (this.status === 'checking' || this.status === 'available') return;
    if (!this.isLocalPage) {
      this.status = 'unavailable';
      return;
    }
    this.status = 'checking';
    try {
      const result = await fetchJson(`${this.baseUrl}/api/status`, {
        timeoutMs: DETECT_TIMEOUT_MS,
      });
      if (!result.ok) throw new Error('unavailable');
      const listed = Array.isArray(result.body.running)
        ? (result.body.running as RunningServer[])
        : [];
      this.running = listed.filter((r) => localDevUrl(String(r.url)) !== null);
      this.status = 'available';
    } catch {
      this.status = 'unavailable';
    }
  }

  find(slug: string) {
    return this.running.find((r) => r.slug === slug);
  }

  async start(slug: string): Promise<RunningServer | null> {
    this.busy = { ...this.busy, [slug]: 'starting' };
    const { [slug]: _cleared, ...rest } = this.errors;
    this.errors = rest;
    try {
      const result = await fetchJson(`${this.baseUrl}/api/dev/${encodeURIComponent(slug)}`, {
        method: 'POST',
        timeoutMs: 90_000,
      });
      if (!result.ok) throw new Error(String(result.body.error ?? `HTTP ${result.status}`));
      const url = localDevUrl(String(result.body.url));
      if (!url)
        throw new Error('The control server returned a non-local URL; refusing to open it.');
      const server: RunningServer = {
        slug,
        url,
        port: Number(result.body.port),
        startedAt: new Date().toISOString(),
      };
      this.running = [...this.running.filter((r) => r.slug !== slug), server];
      return server;
    } catch (error) {
      const message =
        (error as Error).name === 'AbortError'
          ? 'Timed out starting the dev server.'
          : (error as Error).message;
      this.errors = { ...this.errors, [slug]: message };
      return null;
    } finally {
      const { [slug]: _done, ...others } = this.busy;
      this.busy = others;
    }
  }

  async stop(slug: string) {
    this.busy = { ...this.busy, [slug]: 'stopping' };
    try {
      await fetchJson(`${this.baseUrl}/api/stop/${encodeURIComponent(slug)}`, {
        method: 'POST',
        timeoutMs: 15_000,
      });
      this.running = this.running.filter((r) => r.slug !== slug);
    } catch (error) {
      this.errors = { ...this.errors, [slug]: (error as Error).message };
    } finally {
      const { [slug]: _done, ...others } = this.busy;
      this.busy = others;
    }
  }
}

export const control = new ControlClient();
