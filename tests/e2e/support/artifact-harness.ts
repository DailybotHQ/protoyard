import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { ARTIFACT_PACK_TARGET } from '../targets.ts';

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../../..');
const packDir = (target: string) => resolve(REPO_ROOT, 'artifacts', target, 'artifact');

/** The deck the deck artifact spec packs: a committed deck prototype generated from a blueprint. */
export const DECK_ARTIFACT_TARGET = 'create-anything-deck';

export interface ArtifactHarnessOptions {
  /** The prototype to pack with `export --target artifact` (default: relay-chat-demo). */
  target?: string;
  /** `?scenario=` for the packed page (default: busy-day for relay-chat-demo, none otherwise). */
  scenario?: string | null;
  /** The iframe's accessible name. */
  frameTitle?: string;
}

export interface ArtifactHarnessServer {
  url: string;
  /** The packed page's published files, as listed by `artifact-manifest.json`. */
  packFiles(): Promise<string[]>;
  close(): Promise<void>;
}

interface SharedCommentStore {
  values: Map<string, Record<string, unknown>>;
}

function sendJson(response: import('node:http').ServerResponse, value: unknown, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false
  );

/**
 * Packs a target once even when several workers start at the same time:
 * the first takes an atomic mkdir lock and exports; the others wait for it.
 * Two concurrent exports would delete each other's artifact-dist mid-copy.
 */
async function ensurePack(target: string): Promise<void> {
  const page = resolve(packDir(target), 'page.html');
  const lock = resolve(REPO_ROOT, 'artifacts', `${target}.e2e-pack.lock`);
  const deadline = Date.now() + 5 * 60_000;
  await mkdir(dirname(lock), { recursive: true });
  while (!(await exists(page))) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${page}`);
    try {
      await mkdir(lock, { recursive: false });
    } catch {
      await new Promise((done) => setTimeout(done, 500));
      continue;
    }
    try {
      if (!(await exists(page))) {
        await execFileAsync('pnpm', ['protoyard', 'export', target, '--target', 'artifact'], {
          cwd: REPO_ROOT,
          maxBuffer: 8 * 1024 * 1024,
        });
      }
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
}

function harnessHtml(scenario: string | null, frameTitle: string): string {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Artifact pack harness</title></head>
  <body style="margin:0;font-family:system-ui,sans-serif">
    <main><h1>Artifact pack preview</h1><iframe id="artifact-frame" title="${frameTitle.replace(/[<>&"]/g, '')}"></iframe></main>
    <style>html,body,main{width:100%;min-height:100%;margin:0}main{padding:12px;box-sizing:border-box}h1{font-size:1rem;margin:0 0 8px}iframe{display:block;width:100%;height:80vh;border:1px solid #777;background:#fff}</style>
    <script>
      const outer = new URL(location.href);
      const packed = new URL('/__packed__/page.html', location.href);
      const scenario = ${JSON.stringify(scenario)};
      if (scenario) packed.searchParams.set('scenario', scenario);
      if (outer.searchParams.has('noClaude')) packed.searchParams.set('noClaude', '1');
      if (outer.searchParams.has('blockStorage')) packed.searchParams.set('blockStorage', '1');
      packed.hash = outer.hash || '#/';
      document.querySelector('#artifact-frame').src = packed.href;
    </script>
  </body>
</html>`;
}

function mimeType(path: string): string {
  const types: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };
  return types[extname(path)] ?? 'application/octet-stream';
}

async function servePack(
  root: string,
  pathname: string,
  response: import('node:http').ServerResponse
) {
  const requested = decodeURIComponent(pathname.slice('/__packed__/'.length));
  const file = resolve(root, requested || 'page.html');
  const pathFromPack = relative(root, file);
  if (pathFromPack.startsWith(`..${sep}`) || pathFromPack === '..') {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    const content =
      file === resolve(root, 'page.html')
        ? Buffer.from(
            `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>*,*::before,*::after{box-sizing:border-box}html,body{width:100%;min-height:100%;margin:0}body{min-height:100dvh}</style></head><body>${body.toString('utf8')}</body></html>`
          )
        : body;
    response.writeHead(200, { 'content-type': mimeType(file), 'cache-control': 'no-store' });
    response.end(content);
  } catch {
    response.writeHead(404).end('Not found');
  }
}

function handleClaudeRequest(
  request: import('node:http').IncomingMessage,
  response: import('node:http').ServerResponse,
  store: SharedCommentStore
): void {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const collectionPath = url.searchParams.get('path') ?? '';
  if (url.pathname === '/__claude/collection' && request.method === 'GET') {
    const prefix = `${collectionPath}/`;
    const docs = [...store.values]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, data]) => ({ id: path.split('/').at(-1) ?? '', exists: true, data }));
    sendJson(response, { docs });
    return;
  }
  if (url.pathname === '/__claude/document') {
    const existing = store.values.get(collectionPath);
    if (request.method === 'GET') {
      sendJson(response, {
        id: collectionPath.split('/').at(-1) ?? '',
        exists: existing !== undefined,
        data: existing ?? {},
      });
      return;
    }
    if (request.method === 'DELETE') {
      store.values.delete(collectionPath);
      response.writeHead(204).end();
      return;
    }
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      } catch {
        sendJson(response, { error: 'invalid json' }, 400);
        return;
      }
      store.values.set(
        collectionPath,
        request.method === 'PATCH' ? { ...existing, ...data } : data
      );
      response.writeHead(204).end();
    });
    return;
  }
  sendJson(response, { error: 'not found' }, 404);
}

/** Starts an artifact-like host with a packed iframe and a server-shared fake Claude database. */
export async function startArtifactHarnessServer(
  options: ArtifactHarnessOptions = {}
): Promise<ArtifactHarnessServer> {
  const target = options.target ?? ARTIFACT_PACK_TARGET;
  const scenario =
    options.scenario !== undefined
      ? options.scenario
      : target === ARTIFACT_PACK_TARGET
        ? 'busy-day'
        : null;
  const frameTitle =
    options.frameTitle ??
    (target === ARTIFACT_PACK_TARGET ? 'Packed Relay Chat prototype' : `Packed ${target}`);
  const root = packDir(target);
  await ensurePack(target);
  const store: SharedCommentStore = { values: new Map() };
  const vite: ViteDevServer = await createViteServer({
    configFile: false,
    root: REPO_ROOT,
    appType: 'custom',
    server: { middlewareMode: true },
  });

  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/__artifact-harness') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(harnessHtml(scenario, frameTitle));
      return;
    }
    if (url.pathname.startsWith('/__packed__/')) {
      void servePack(root, url.pathname, response);
      return;
    }
    if (url.pathname.startsWith('/__claude/')) {
      handleClaudeRequest(request, response, store);
      return;
    }
    vite.middlewares(request, response, () => response.writeHead(404).end('Not found'));
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Artifact harness did not bind');

  return {
    url: `http://127.0.0.1:${address.port}/__artifact-harness`,
    async packFiles() {
      const manifest = JSON.parse(
        await readFile(resolve(root, 'artifact-manifest.json'), 'utf8')
      ) as { files?: { path: string }[] };
      return (manifest.files ?? []).map((file) => file.path);
    },
    async close() {
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
      await vite.close();
    },
  };
}

/** Script installed before navigation; each frame gets a capability surface backed by the host. */
export const FAKE_CLAUDE_INIT_SCRIPT = `(() => {
  const options = new URL(location.href).searchParams;
  if (options.has('blockStorage')) {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
  }
  if (options.has('noClaude')) return;
  const base = location.origin;
  const json = async (url, method = 'GET', body) => {
    const response = await fetch(url, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
    if (!response.ok && response.status !== 204) throw new Error('fake Claude storage failed: ' + response.status);
    return response.status === 204 ? undefined : response.json();
  };
  const doc = (path) => ({
    get: () => json(base + '/__claude/document?path=' + encodeURIComponent(path)),
    set: (data) => json(base + '/__claude/document?path=' + encodeURIComponent(path), 'PUT', data),
    update: (data) => json(base + '/__claude/document?path=' + encodeURIComponent(path), 'PATCH', data),
    delete: () => json(base + '/__claude/document?path=' + encodeURIComponent(path), 'DELETE'),
    onSnapshot: () => () => {},
  });
  const collection = (path) => ({
    get: () => json(base + '/__claude/collection?path=' + encodeURIComponent(path)),
    onSnapshot: () => () => {},
  });
  Object.defineProperty(window, 'claude', { configurable: true, value: {
    use: async (capability) => capability === 'db'
      ? { doc, collection }
      : { id: () => 'user-artifact-reviewer', profiles: async (ids) => Object.fromEntries(ids.map((id) => [id, { displayName: 'Mira Reviewer' }])), can: () => true },
  } });
})();`;
