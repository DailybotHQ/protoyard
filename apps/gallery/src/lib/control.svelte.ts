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

/** Header the control server checks on POST /api/new (see packages/cli control-server). */
export const CREATE_TOKEN_HEADER = 'x-protoyard-token';

/**
 * Create access from GET /api/status: the server only includes the per-run
 * token for an allowed Origin, and only when it runs with --allow-create.
 */
export function readCreateAccess(body: Record<string, unknown>): {
  enabled: boolean;
  token: string | null;
} {
  const create = body.create as { enabled?: unknown; token?: unknown } | undefined;
  const token = typeof create?.token === 'string' && create.token.length > 0 ? create.token : null;
  return { enabled: create?.enabled === true && token !== null, token };
}

class ControlClient {
  status = $state<Status>('unknown');
  running = $state<RunningServer[]>([]);
  /** Slug → in-flight action, for button states. */
  busy = $state<Record<string, 'starting' | 'stopping'>>({});
  errors = $state<Record<string, string>>({});
  /** True when the control server was started with --allow-create. */
  createEnabled = $state(false);
  /** Per-run token for POST /api/new; kept out of reactive state and never logged. */
  #createToken: string | null = null;
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
      const access = readCreateAccess(result.body);
      this.#createToken = access.token;
      this.createEnabled = access.enabled;
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

  /**
   * POST /api/new: copy a template or prototype into a new slug, link it and
   * start it (control server). Returns the raw response for the caller to
   * interpret (marketplace `interpretCreate`). A started prototype joins
   * `running`, so its own detail page and the palette see it.
   */
  async create(request: { slug: string; from: string; name?: string }) {
    if (!this.#createToken) {
      return {
        ok: false,
        status: 0,
        body: {
          ok: false,
          error:
            'Creating prototypes from the gallery is off. Start it with `pnpm protoyard gallery --allow-create`.',
        } as Record<string, unknown>,
      };
    }
    try {
      const result = await fetchJson(`${this.baseUrl}/api/new`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CREATE_TOKEN_HEADER]: this.#createToken },
        body: JSON.stringify(request),
        timeoutMs: 180_000,
      });
      const url = localDevUrl(String(result.body.url ?? ''));
      if (result.ok && url) {
        const slug = String(result.body.slug ?? request.slug);
        const server: RunningServer = {
          slug,
          url,
          port: Number(result.body.port),
          startedAt: new Date().toISOString(),
        };
        this.running = [...this.running.filter((r) => r.slug !== slug), server];
      }
      return result;
    } catch (error) {
      const message =
        (error as Error).name === 'AbortError'
          ? 'Timed out creating the prototype.'
          : (error as Error).message;
      return {
        ok: false,
        status: 0,
        body: { ok: false, error: message } as Record<string, unknown>,
      };
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
