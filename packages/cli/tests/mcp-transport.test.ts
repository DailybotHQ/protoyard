// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const CLI_ENTRY = resolve(REPO, 'packages/cli/src/bin.ts');

function line(message: unknown): string {
  return `${JSON.stringify(message)}\n`;
}

describe('protoyard mcp stdio transport', () => {
  it('completes initialize, tools/list and tools/call over newline-delimited stdio', () => {
    const input = [
      line({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      }),
      line({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      line({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      line({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'unknown' } }),
    ].join('');
    const run = spawnSync(process.execPath, ['--import', 'tsx', CLI_ENTRY, 'mcp'], {
      cwd: REPO,
      encoding: 'utf8',
      input,
      timeout: 20_000,
    });

    expect(run.status).toBe(0);
    expect(run.stderr).toBe('');
    const replies = run.stdout
      .trim()
      .split('\n')
      .map((entry) => JSON.parse(entry) as Record<string, unknown>);
    expect(replies).toHaveLength(3);
    expect(replies[0]).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-11-25',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'protoyard' },
      },
    });
    expect(replies[1]).toMatchObject({ jsonrpc: '2.0', id: 2, result: { tools: [] } });
    expect(replies[2]).toMatchObject({
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
      },
    });
  });

  it('returns a parse error response and keeps diagnostics off stdout', () => {
    const run = spawnSync(process.execPath, ['--import', 'tsx', CLI_ENTRY, 'mcp'], {
      cwd: REPO,
      encoding: 'utf8',
      input: '{broken json\n',
      timeout: 20_000,
    });

    expect(run.status).toBe(0);
    expect(
      run.stdout
        .split('\n')
        .filter(Boolean)
        .map((entry) => JSON.parse(entry))
    ).toEqual([{ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }]);
    expect(run.stderr).toContain('received invalid JSON');
  });
});
