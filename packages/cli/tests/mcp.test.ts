// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Envelope } from '../src/lib/output.ts';
import { canonicalPath, resolveWorkspaceRoot } from '../src/lib/paths.ts';
import { createPlayerAssetsManifest } from '../src/lib/quick/player-assets.ts';
import { callMcpTool, createMcpToolHandler, MCP_TOOLS } from '../src/mcp/tools.ts';
import { addTemplate, createWorkspace, runMcpProcess, type TempWorkspace } from './helpers.ts';

const MODERN = '2026-07-28';
const LEGACY = '2025-11-25';
const VERSION_KEY = 'io.modelcontextprotocol/protocolVersion';

function line(message: unknown): string {
  return `${JSON.stringify(message)}\n`;
}

function modernRequest(
  id: number,
  method: string,
  params: Record<string, unknown> = {},
  version = MODERN
) {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params: { ...params, _meta: { [VERSION_KEY]: version } },
  };
}

function frames(stdout: string): Record<string, unknown>[] {
  const lines = stdout.trim().split('\n');
  expect(lines.length).toBeGreaterThan(0);
  return lines.map((entry) => {
    const frame = JSON.parse(entry) as Record<string, unknown>;
    expect(frame.jsonrpc).toBe('2.0');
    return frame;
  });
}

function frameAt(result: Record<string, unknown>[], index: number): Record<string, unknown> {
  const frame = result[index];
  if (!frame) throw new Error(`Missing protocol frame ${index}.`);
  return frame;
}

function contentText(frame: Record<string, unknown>): string {
  const result = frame.result;
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new Error('MCP frame has no result object.');
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content) || typeof content[0] !== 'object' || content[0] === null)
    throw new Error('MCP frame has no text content.');
  const text = (content[0] as { text?: unknown }).text;
  if (typeof text !== 'string') throw new Error('MCP frame content is not text.');
  return text;
}

async function addPlayerFixture(ws: TempWorkspace): Promise<void> {
  const packageDir = join(ws.root, 'node_modules', '@protoyard', 'player');
  const appDir = join(packageDir, 'dist', 'app');
  ws.write('node_modules/@protoyard/player/package.json', {
    name: '@protoyard/player',
    version: '1.0.0',
  });
  ws.write('node_modules/.modules.yaml', 'fixture: true\n');
  mkdirSync(join(appDir, 'assets'), { recursive: true });
  ws.write('node_modules/@protoyard/player/dist/app/index.html', '<!doctype html>\n');
  ws.write('node_modules/@protoyard/player/dist/app/assets/app.js', 'export {};\n');
  await createPlayerAssetsManifest(appDir, '1.0.0');
}

async function createMcpWorkspace(): Promise<TempWorkspace> {
  const ws = createWorkspace();
  ws.write('packages/core/package.json', { name: '@protoyard/core', version: '1.0.0' });
  addTemplate(ws);
  await addPlayerFixture(ws);
  return ws;
}

let ws: TempWorkspace;

beforeEach(async () => {
  ws = await createMcpWorkspace();
});

afterEach(() => {
  ws.cleanup();
});

describe('protoyard mcp real client exchange', () => {
  // A real child process runs quick and doctor: seconds alone, longer while the CLI suite runs.
  it('preserves modern protocol frames, runs quick and doctor, rejects invalid input, and shuts down on EOF', {
    timeout: 60_000,
  }, async () => {
    const run = await runMcpProcess(
      [
        line(modernRequest(1, 'server/discover')),
        line(
          modernRequest(2, 'tools/call', {
            name: 'quick',
            arguments: {
              brief:
                'A fictional field service team schedules equipment inspections, assigns technicians and tracks each visit.',
            },
          })
        ),
        line(modernRequest(3, 'tools/call', { name: 'doctor', arguments: {} })),
        line(
          modernRequest(4, 'tools/call', {
            name: 'quick',
            arguments: { brief: 'one idea', blueprint: 'another idea' },
          })
        ),
      ].join(''),
      { cwd: ws.root }
    );

    expect(run).toMatchObject({ status: 0, signal: null, timedOut: false, stderr: '' });
    const result = frames(run.stdout);
    expect(result).toHaveLength(4);
    expect(frameAt(result, 0)).toMatchObject({
      id: 1,
      result: { resultType: 'complete', supportedVersions: [MODERN, LEGACY] },
    });

    const quickText = contentText(frameAt(result, 1));
    expect(JSON.parse(quickText), quickText).toMatchObject({ ok: true, command: 'quick' });
    const doctorText = contentText(frameAt(result, 2));
    expect(JSON.parse(doctorText)).toMatchObject({ ok: true, command: 'doctor' });
    const invalidText = contentText(frameAt(result, 3));
    expect(JSON.parse(invalidText)).toMatchObject({
      ok: false,
      command: 'quick',
      error: { code: 'validation' },
    });
  });
});

describe('protoyard mcp stdio transport', () => {
  const REPO = fileURLToPath(new URL('../../../', import.meta.url));
  const CLI_ENTRY = resolve(REPO, 'packages/cli/src/bin.ts');
  const MODERN = '2026-07-28';
  const LEGACY = '2025-11-25';
  const VERSION_KEY = 'io.modelcontextprotocol/protocolVersion';
  const SERVER_KEY = 'io.modelcontextprotocol/serverInfo';

  function line(message: unknown): string {
    return `${JSON.stringify(message)}\n`;
  }

  function modernRequest(
    id: number,
    method: string,
    params: Record<string, unknown> = {},
    version = MODERN
  ) {
    return {
      jsonrpc: '2.0',
      id,
      method,
      params: { ...params, _meta: { [VERSION_KEY]: version } },
    };
  }

  function runServer(input: string) {
    return spawnSync(process.execPath, ['--import', 'tsx', CLI_ENTRY, 'mcp'], {
      cwd: REPO,
      encoding: 'utf8',
      input,
      timeout: 20_000,
    });
  }

  function replies(stdout: string): Record<string, unknown>[] {
    return stdout
      .trim()
      .split('\n')
      .map((entry) => JSON.parse(entry) as Record<string, unknown>);
  }

  describe('protoyard mcp stdio transport', () => {
    it('discovers and serves stateless 2026-07-28 requests', () => {
      const run = runServer(
        [
          line(modernRequest(1, 'server/discover')),
          line(modernRequest(2, 'tools/list')),
          line(modernRequest(3, 'tools/call', { name: 'unknown', arguments: {} })),
        ].join('')
      );

      expect(run.status).toBe(0);
      expect(run.stderr).toBe('');
      const result = replies(run.stdout);
      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        result: {
          resultType: 'complete',
          supportedVersions: [MODERN, LEGACY],
          capabilities: { tools: {} },
          _meta: { [SERVER_KEY]: { name: 'protoyard' } },
        },
      });
      expect(result[1]).toMatchObject({
        jsonrpc: '2.0',
        id: 2,
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({ name: 'blueprint_schema' }),
            expect.objectContaining({ name: 'doctor' }),
          ]),
          _meta: { [SERVER_KEY]: { name: 'protoyard' } },
        },
      });
      expect(result[2]).toMatchObject({
        jsonrpc: '2.0',
        id: 3,
        result: {
          isError: true,
          content: [
            {
              type: 'text',
              text: '{"ok":false,"command":"mcp","error":{"code":"not_found","message":"Unknown MCP tool: unknown"}}',
            },
          ],
          _meta: { [SERVER_KEY]: { name: 'protoyard' } },
        },
      });
    });

    it('names supported revisions when rejecting unsupported protocol versions', () => {
      const run = runServer(line(modernRequest(9, 'tools/list', {}, '2030-01-01')));

      expect(run.status).toBe(0);
      expect(replies(run.stdout)).toEqual([
        {
          jsonrpc: '2.0',
          id: 9,
          error: {
            code: -32022,
            message: 'Unsupported protocol version',
            data: { supported: [MODERN, LEGACY], requested: '2030-01-01' },
          },
        },
      ]);
    });
  });
});

describe('MCP tool catalog and strict input contracts', () => {
  function success(command: string, data: unknown): Envelope {
    return { ok: true, command, data };
  }

  describe('MCP tool catalog and strict input contracts', () => {
    it('advertises the adopted tools with closed object schemas', () => {
      expect(MCP_TOOLS.map((tool) => tool.name)).toEqual([
        'blueprint_schema',
        'doctor',
        'ds_component_new',
        'ds_component_request',
        'ds_create',
        'ds_export',
        'ds_list',
        'ds_use',
        'ds_validate',
        'iterate',
        'new_from_design_system',
        'promote',
        'quick',
        'screenshot',
        'validate_blueprint',
      ]);
      for (const tool of MCP_TOOLS) {
        expect(tool.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
      }
      expect(MCP_TOOLS.find((tool) => tool.name === 'quick')?.inputSchema.oneOf).toHaveLength(2);
    });

    it('rejects extra fields and invalid exclusive quick inputs as CLI envelopes', async () => {
      const handler = createMcpToolHandler({ runCli: async () => success('unused', {}) });
      const extra = await handler('doctor', { offline: true, anythingElse: 'ignored?' });
      const conflict = await handler('quick', {
        brief: 'A booking tool',
        blueprint: 'idea.json',
      });

      expect(extra).toMatchObject({
        ok: false,
        command: 'doctor',
        error: { code: 'validation' },
      });
      expect(conflict).toMatchObject({
        ok: false,
        command: 'quick',
        error: { code: 'validation' },
      });
    });

    it('returns real CLI envelopes for schema, validation and a missing exploration', async () => {
      const schema = await callMcpTool('blueprint_schema', {});
      const validation = await callMcpTool('validate_blueprint', {
        file: 'blueprints/booking-scheduling.json',
      });
      // `quick iterate` exists now: an unknown exploration is a structured not_found.
      const missing = await callMcpTool('iterate', { dir: 'demo', patchFile: 'change.json' });

      expect(schema).toMatchObject({ ok: true, command: 'blueprint_schema' });
      expect((schema.data as { $schema: string }).$schema).toMatch(/^https:/);
      expect(validation).toMatchObject({
        ok: true,
        command: 'blueprint validate',
        data: { valid: true },
      });
      expect(missing).toMatchObject({
        ok: false,
        command: 'quick iterate',
        error: { code: 'not_found' },
      });
    });
  });
});

describe('MCP kind tools', () => {
  /**
   * MCP kind surface (Task 145 / T-kinds-doctor-mcp):
   * - `quick.kind` forces the synthesizer kind for a brief
   * - `blueprint_schema` returns the kind-union schema
   * - `validate_blueprint` returns the kind summary
   */

  function success(command: string, data: unknown): Envelope {
    return { ok: true, command, data };
  }

  describe('MCP kind tools (T-kinds-doctor-mcp)', () => {
    it('maps quick kind=deck to CLI --kind deck (AC-kinds-dm-tests)', async () => {
      const calls: string[][] = [];
      const root = canonicalPath(resolveWorkspaceRoot());
      const handler = createMcpToolHandler({
        workspaceRoot: root,
        runCli: async (args) => {
          calls.push(args);
          return success('quick', { kind: 'deck', accepted: true });
        },
      });
      const result = await handler('quick', {
        brief: 'A five-slide pitch for a fictional analytics product.',
        kind: 'deck',
        seed: 7,
      });
      expect(result).toMatchObject({ ok: true, command: 'quick' });
      expect(calls).toEqual([
        [
          'quick',
          '--seed',
          '7',
          '--kind',
          'deck',
          '--',
          'A five-slide pitch for a fictional analytics product.',
        ],
      ]);
    });
  });
});
