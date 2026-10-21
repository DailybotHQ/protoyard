// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { setQuickPlayerLocator } from '../src/commands/quick/index.ts';
import { resolveQuickServeTarget } from '../src/commands/quick/serve.ts';
import { captureExploration, setQuickShotLauncher } from '../src/commands/quick/shot.ts';
import { runWithAbortSignal, throwIfAborted } from '../src/lib/abort.ts';
import { captureMayFetch } from '../src/lib/capture/index.ts';
import { installWorkspace } from '../src/lib/pnpm.ts';
import { run } from '../src/lib/process.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../src/lib/quick/player-assets.ts';
import { MCP_MAX_LINE_BYTES, sanitizeMcpValue, withMcpTimeout } from '../src/mcp/security.ts';
import { boundedLines } from '../src/mcp/stdio.ts';
import { cliArgs, createMcpToolHandler, runCliEnvelope } from '../src/mcp/tools.ts';
import { addCrudTemplate, createWorkspace } from './helpers.ts';

/**
 * Hardening of the MCP adapter and the quick screenshot capture:
 * - `quick` and every positional tool build argv as options, then `--`, then
 *   positionals, with canonical absolute paths and validated slugs;
 * - `-` (stdin) is refused for a brief and a patch file, and the session keeps
 *   answering;
 * - a timeout cancels the operation: child processes are killed, none start
 *   afterwards, and later steps (install, recording a promotion) are skipped;
 * - over-cap request lines are refused before parsing;
 * - every control character except tab and newline leaves envelope strings;
 * - a screenshot launcher may only point at the capture server's origin.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const ANALYTICS = join(REPO, 'blueprints/quick/analytics.json');
const cleanups: (() => void)[] = [];
afterAll(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A temp workspace with a tiny prebuilt player, and an MCP handler that runs the real CLI there. */
async function workspaceHandler(timeoutMs?: number) {
  const ws = createWorkspace();
  cleanups.push(ws.cleanup);
  const dir = join(ws.root, 'fixture-player', 'dist', 'app');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><script type="module" src="./assets/app.js"></script>\n'
  );
  writeFileSync(join(dir, 'assets', 'app.js'), 'export {};\n');
  const manifest = await createPlayerAssetsManifest(dir, '1.0.0');
  const player = {
    dir,
    packageDir: join(ws.root, 'fixture-player'),
    version: '1.0.0',
    manifest,
    source: 'repository' as const,
  };
  cleanups.push(
    setQuickPlayerLocator(() => ({ ...player, manifest: readPlayerAssetsManifest(dir) }))
  );
  const handler = createMcpToolHandler({
    workspaceRoot: ws.root,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    runCli: (args) => runCliEnvelope(['--root', ws.root, ...args]),
  });
  return { ws, handler };
}

describe('MCP argv: options, then --, then positionals', () => {
  it('runs quick with a brief together with slug, seed and variants', async () => {
    const { ws, handler } = await workspaceHandler();
    const result = await handler('quick', {
      brief: 'A fictional climbing gym books classes and tracks members.',
      slug: 'gym-classes',
      seed: 3,
      variants: 2,
    });
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true, command: 'quick' });
    expect((result.data as { slug: string }).slug).toBe('gym-classes');
    expect(existsSync(join(ws.root, '.protoyard/quick/gym-classes/v2/blueprint.json'))).toBe(true);
  });

  it('treats a brief that looks like an option as the brief', async () => {
    const { handler } = await workspaceHandler();
    const result = await handler('quick', { brief: '--version', slug: 'dash-brief' });
    expect(result).toMatchObject({ ok: true, command: 'quick' });
    expect((result.data as { slug: string }).slug).toBe('dash-brief');
  });

  it('puts a single -- before the positionals, never before an option', () => {
    for (const [name, value] of [
      ['quick', { brief: 'x', slug: 's', seed: 1, standalone: true }],
      ['iterate', { dir: '/w/d', patchFile: '/w/p.json', allowDrop: true }],
      ['validate_blueprint', { file: '/w/b.json' }],
      ['screenshot', { dir: '/w/d' }],
      ['promote', { dir: '/w/d', slug: 's', variant: 'v1', noInstall: true }],
    ] as const) {
      const argv = cliArgs(name, value as Record<string, unknown>);
      const separator = argv.indexOf('--');
      expect(
        argv.filter((word) => word === '--'),
        name
      ).toHaveLength(1);
      expect(
        argv.slice(separator + 1).some((word) => word.startsWith('--')),
        name
      ).toBe(false);
    }
  });

  it('refuses invalid slugs in the schema, before the CLI runs', async () => {
    const calls: string[][] = [];
    const handler = createMcpToolHandler({
      workspaceRoot: REPO,
      runCli: async (args) => {
        calls.push(args);
        return { ok: true, command: 'quick', data: {} };
      },
    });
    for (const slug of ['--help', '-x', 'Bad Slug', '../escape']) {
      expect(await handler('quick', { brief: 'x', slug })).toMatchObject({
        ok: false,
        error: { code: 'validation' },
      });
      expect(await handler('promote', { dir: 'demo', slug })).toMatchObject({
        ok: false,
        error: { code: 'validation' },
      });
    }
    expect(calls).toEqual([]);
  });
});

describe('stdin is the JSON-RPC channel', () => {
  it('refuses "-" for a brief and a patch file', async () => {
    const handler = createMcpToolHandler({
      workspaceRoot: REPO,
      runCli: async () => {
        throw new Error('must not run');
      },
    });
    for (const [name, args] of [
      ['quick', { brief: '-' }],
      ['quick', { brief: ' - ' }],
      ['iterate', { dir: 'demo', patchFile: '-' }],
    ] as const) {
      expect(await handler(name, args)).toMatchObject({ ok: false, error: { code: 'validation' } });
    }
  });

  it('keeps the stdio session answering after a "-" brief', () => {
    const cli = resolve(REPO, 'packages/cli/src/bin.ts');
    const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' };
    const input = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'quick', arguments: { brief: '-' }, _meta: meta },
      },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: { _meta: meta } },
    ]
      .map((message) => `${JSON.stringify(message)}\n`)
      .join('');
    const server = spawnSync(process.execPath, ['--import', 'tsx', cli, 'mcp'], {
      cwd: REPO,
      encoding: 'utf8',
      input,
      timeout: 30_000,
    });
    const replies = server.stdout
      .trim()
      .split('\n')
      .map(
        (text) =>
          JSON.parse(text) as {
            id: number;
            result?: { isError?: boolean; tools?: unknown[]; content?: { text: string }[] };
          }
      );
    expect(replies.map((reply) => reply.id)).toEqual([1, 2]);
    expect(replies[0]?.result?.isError).toBe(true);
    expect(replies[0]?.result?.content?.[0]?.text).toContain('validation');
    expect(replies[1]?.result?.tools?.length).toBeGreaterThan(0);
  });
});

describe('a timeout cancels the operation', () => {
  it('kills the running child process and starts no new one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'protoyard-mcp-abort-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const marker = join(dir, 'late-write');
    const late = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x'), 1500)`;
    let second: Awaited<ReturnType<typeof run>> | undefined;
    await expect(
      withMcpTimeout(async () => {
        await run(process.execPath, ['-e', late]);
        second = await run(process.execPath, ['-e', late]);
      }, 200)
    ).rejects.toThrow(/timed out after 200 ms and was cancelled/);
    // Give the first child time to have written, had it survived.
    await new Promise((done) => setTimeout(done, 2_000));
    expect(existsSync(marker)).toBe(false);
    expect(second).toMatchObject({ aborted: true, code: 130 });
  });

  it('never installs dependencies once aborted, online or offline', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runWithAbortSignal(controller.signal, () => installWorkspace(tmpdir(), 'pipe'))
    ).rejects.toThrow(/Cancelled before installing dependencies/);
    expect(() => throwIfAborted('anything')).not.toThrow(); // outside a scope nothing changes
  });

  it('does not record a promotion after the caller gave up', async () => {
    const { ws } = await workspaceHandler();
    addCrudTemplate(ws);
    const created = await runCliEnvelope([
      '--root',
      ws.root,
      'quick',
      '--slug',
      'abort-me',
      '--blueprint',
      ANALYTICS,
    ]);
    expect(created).toMatchObject({ ok: true });
    const controller = new AbortController();
    controller.abort();
    const promoted = await runWithAbortSignal(controller.signal, () =>
      runCliEnvelope([
        '--root',
        ws.root,
        'quick',
        'promote',
        '--no-install',
        '--',
        'abort-me',
        'abort-app',
      ])
    );
    expect(promoted).toMatchObject({
      ok: false,
      error: { message: expect.stringMatching(/Cancelled before recording the promotion/) },
    });
    const record = JSON.parse(
      readFileSync(join(ws.root, '.protoyard/quick/abort-me/quick.json'), 'utf8')
    ) as {
      promotedTo: unknown;
    };
    expect(record.promotedTo).toBeNull();
  });
});

describe('stdio request lines', () => {
  const lines = async (chunks: (string | Buffer)[], max: number) => {
    const out: (string | null)[] = [];
    for await (const line of boundedLines(Readable.from(chunks), max)) out.push(line);
    return out;
  };

  it('yields lines across chunks, strips \\r, and refuses an over-cap line without buffering it', async () => {
    expect(await lines(['{"a":', '1}\r\n{"b":2}\n'], 64)).toEqual(['{"a":1}', '{"b":2}']);
    expect(await lines(['x'.repeat(40), 'y'.repeat(40), '\nok\n'], 64)).toEqual([null, 'ok']);
    expect(await lines(['z'.repeat(100)], 64)).toEqual([null]);
    expect(await lines(['\n'], 64)).toEqual(['']);
  });

  it('answers an over-cap line with -32600 before parsing, and keeps serving', () => {
    const cli = resolve(REPO, 'packages/cli/src/bin.ts');
    const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' };
    const huge = `{"jsonrpc":"2.0","id":7,"method":"tools/list","params":{"pad":"${'x'.repeat(MCP_MAX_LINE_BYTES)}"}}\n`;
    const next = `${JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/list', params: { _meta: meta } })}\n`;
    const server = spawnSync(process.execPath, ['--import', 'tsx', cli, 'mcp'], {
      cwd: REPO,
      encoding: 'utf8',
      input: huge + next,
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    const replies = server.stdout
      .trim()
      .split('\n')
      .map(
        (text) =>
          JSON.parse(text) as { id: number | null; error?: { code: number }; result?: unknown }
      );
    expect(replies[0]).toMatchObject({ id: null, error: { code: -32600 } });
    expect(replies[1]).toMatchObject({ id: 8 });
    expect(server.stderr).toContain('refused a request line');
  });
});

describe('envelope strings', () => {
  it('lose every control character except tab and newline', () => {
    expect(sanitizeMcpValue('a\u0000b\u0007c\u001bd\u007fe')).toBe('abcde');
    expect(sanitizeMcpValue('line 1\nline 2\n\tindented\rend')).toBe(
      'line 1\nline 2\n\tindentedend'
    );
    expect(sanitizeMcpValue({ nested: ['x\u0001\u0002y'] })).toEqual({ nested: ['xy'] });
  });
});

describe('screenshot capture origin', () => {
  it('refuses a launcher that points outside the capture server', async () => {
    const { ws } = await workspaceHandler();
    const created = await runCliEnvelope([
      '--root',
      ws.root,
      'quick',
      '--slug',
      'shot-me',
      '--blueprint',
      ANALYTICS,
    ]);
    expect(created).toMatchObject({ ok: true });
    const launcher = join(ws.root, '.protoyard/quick/shot-me/index.html');
    writeFileSync(
      launcher,
      readFileSync(launcher, 'utf8').replace(/url=[^"]+"/, 'url=https://elsewhere.example/player/"')
    );
    let pagesOpened = 0;
    const fakeBrowser = {
      newContext: async () => {
        pagesOpened += 1;
        throw new Error('no page may open');
      },
      close: async () => {},
    };
    cleanups.push(setQuickShotLauncher(async () => ({ ok: true, browser: fakeBrowser as never })));
    const target = await resolveQuickServeTarget({
      workspaceRoot: ws.root,
      cwd: ws.root,
      target: 'shot-me',
    });
    const result = await captureExploration(target);
    expect(result.skipped).toMatchObject({
      reason: 'capture-failed',
      detail: expect.stringContaining('points outside the exploration (https://elsewhere.example)'),
    });
    expect(pagesOpened).toBe(0);
  });

  it('lets a capture context fetch only its own origin, data: and blob:', () => {
    const origin = 'http://127.0.0.1:43123';
    expect(captureMayFetch(`${origin}/gym/index.html`, origin)).toBe(true);
    expect(captureMayFetch('data:image/png;base64,AAAA', origin)).toBe(true);
    expect(captureMayFetch('blob:http://127.0.0.1:43123/abc', origin)).toBe(true);
    expect(captureMayFetch('https://elsewhere.example/a.js', origin)).toBe(false);
    expect(captureMayFetch('http://127.0.0.1:9999/', origin)).toBe(false);
    expect(captureMayFetch('not a url', origin)).toBe(false);
  });
});
