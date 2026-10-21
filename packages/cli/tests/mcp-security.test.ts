// @vitest-environment node
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Envelope } from '../src/lib/output.ts';
import { canonicalPath } from '../src/lib/paths.ts';
import {
  assertMcpOutputSize,
  assertMcpRequestSize,
  MCP_MAX_OUTPUT_BYTES,
  MCP_MAX_REQUEST_BYTES,
  resolveMcpPath,
  sanitizeMcpEnvelope,
} from '../src/mcp/security.ts';
import { createMcpToolHandler } from '../src/mcp/tools.ts';

function success(data: unknown = {}): Envelope {
  return { ok: true, command: 'quick', data };
}

describe('MCP trust boundary', () => {
  it('rejects traversal, shell syntax, and symlink escapes', () => {
    const root = mkdtempSync(join(tmpdir(), 'protoyard-mcp-'));
    const outside = mkdtempSync(join(tmpdir(), 'protoyard-outside-'));
    mkdirSync(join(root, 'tmp', 'scratch'), { recursive: true });
    symlinkSync(outside, join(root, 'link'));
    const policy = { workspaceRoot: root };

    expect(() => resolveMcpPath('../outside', policy)).toThrow(/parent folder/);
    expect(() => resolveMcpPath('tmp/scratch/preview;touch', policy)).toThrow(
      /shell metacharacters/
    );
    expect(() => resolveMcpPath('link/result.json', policy)).toThrow(/inside the workspace/);
    expect(resolveMcpPath('tmp/scratch/preview', policy)).toBe(
      join(canonicalPath(root), 'tmp', 'scratch', 'preview')
    );
  });

  it('bounds encoded request arguments before validation or dispatch', () => {
    expect(() => assertMcpRequestSize({ brief: 'x'.repeat(MCP_MAX_REQUEST_BYTES) })).toThrow(
      `${MCP_MAX_REQUEST_BYTES} bytes`
    );
  });

  it('keeps shell metacharacters as argv data instead of interpolating them', async () => {
    const calls: string[][] = [];
    const handler = createMcpToolHandler({
      workspaceRoot: process.cwd(),
      runCli: async (args) => {
        calls.push(args);
        return success();
      },
    });

    await expect(
      handler('quick', { brief: 'show $(touch should-not-run)' })
    ).resolves.toMatchObject({
      ok: true,
    });
    expect(calls).toEqual([['quick', '--', 'show $(touch should-not-run)']]);
  });

  it('rejects arbitrary commands and paths outside the workspace', async () => {
    const handler = createMcpToolHandler({ workspaceRoot: process.cwd() });
    await expect(handler('exec', { command: 'echo unsafe' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'not_found' },
    });
    await expect(handler('validate_blueprint', { file: '../outside.json' })).resolves.toMatchObject(
      {
        ok: false,
        error: { code: 'unsafe_path' },
      }
    );
  });

  it('redacts credential-shaped output fields and rejects oversized output', () => {
    expect(
      sanitizeMcpEnvelope({
        ok: true,
        command: 'doctor',
        data: { credential: 'sensitive fixture', nested: { privateValue: 'kept' } },
      })
    ).toEqual({
      ok: true,
      command: 'doctor',
      data: { credential: '[redacted]', nested: { privateValue: 'kept' } },
    });
    expect(() => assertMcpOutputSize({ value: 'x'.repeat(MCP_MAX_OUTPUT_BYTES) })).toThrow(
      `${MCP_MAX_OUTPUT_BYTES} bytes`
    );
  });

  it('returns a bounded timeout envelope for a stalled tool', async () => {
    const handler = createMcpToolHandler({
      workspaceRoot: process.cwd(),
      timeoutMs: 5,
      runCli: () => new Promise<Envelope>((resolve) => setTimeout(() => resolve(success()), 25)),
    });
    await expect(handler('doctor', {})).resolves.toMatchObject({
      ok: false,
      error: { code: 'failure', message: expect.stringContaining('timed out') },
    });
  });
});
