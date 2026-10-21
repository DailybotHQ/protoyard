// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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

  it('negotiates and serves the 2025-11-25 initialize-based client', () => {
    const run = runServer(
      [
        line({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: LEGACY,
            capabilities: {},
            clientInfo: { name: 'test', version: '1' },
          },
        }),
        line({ jsonrpc: '2.0', method: 'notifications/initialized' }),
        line({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
        line({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'unknown' } }),
      ].join('')
    );

    expect(run.status).toBe(0);
    expect(run.stderr).toBe('');
    const result = replies(run.stdout);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { protocolVersion: LEGACY, capabilities: { tools: { listChanged: false } } },
    });
    expect(result[1]).toMatchObject({
      jsonrpc: '2.0',
      id: 2,
      result: { tools: expect.any(Array) },
    });
    expect(result[2]).toMatchObject({ jsonrpc: '2.0', id: 3, result: { isError: true } });
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

  it('returns a parse error response and keeps diagnostics off stdout', () => {
    const run = runServer('{broken json\n');

    expect(run.status).toBe(0);
    expect(replies(run.stdout)).toEqual([
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
    ]);
    expect(run.stderr).toContain('received invalid JSON');
  });
});
