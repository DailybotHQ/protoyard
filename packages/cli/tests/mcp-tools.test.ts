// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Envelope } from '../src/lib/output.ts';
import { callMcpTool, createMcpToolHandler, MCP_TOOLS } from '../src/mcp/tools.ts';

function success(command: string, data: unknown): Envelope {
  return { ok: true, command, data };
}

describe('MCP tool catalog and strict input contracts', () => {
  it('advertises the adopted tools with closed object schemas', () => {
    expect(MCP_TOOLS.map((tool) => tool.name)).toEqual([
      'blueprint_schema',
      'doctor',
      'iterate',
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

  it('maps tool calls to the corresponding existing CLI command paths', async () => {
    const calls: string[][] = [];
    const handler = createMcpToolHandler({
      runCli: async (args) => {
        calls.push(args);
        return success(args[0] ?? 'unknown', { accepted: true });
      },
      loadSchema: async () => ({ $schema: 'draft-2020-12' }),
    });
    const cases: { name: string; args: Record<string, unknown>; cli: string[] }[] = [
      { name: 'quick', args: { brief: 'A booking tool' }, cli: ['quick', '--', 'A booking tool'] },
      {
        name: 'iterate',
        args: { dir: 'demo', patchFile: 'change.json', allowDrop: true },
        cli: ['quick', 'iterate', 'demo', '--patch', 'change.json', '--allow-drop'],
      },
      {
        name: 'validate_blueprint',
        args: { file: 'idea.json' },
        cli: ['blueprint', 'validate', 'idea.json'],
      },
      { name: 'screenshot', args: { dir: 'demo' }, cli: ['quick', 'shot', 'demo'] },
      {
        name: 'promote',
        args: { dir: 'demo', slug: 'my-prototype', variant: 'v2', noInstall: true },
        cli: ['quick', 'promote', 'demo', 'my-prototype', '--variant', 'v2', '--no-install'],
      },
      { name: 'doctor', args: {}, cli: ['doctor', '--offline'] },
    ];

    for (const item of cases) {
      const result = await handler(item.name, item.args);
      expect(result).toMatchObject({ ok: true });
    }
    expect(calls).toEqual(cases.map((item) => item.cli));
    expect(await handler('blueprint_schema', {})).toEqual({
      ok: true,
      command: 'blueprint_schema',
      data: { $schema: 'draft-2020-12' },
    });
  });

  it('returns real CLI envelopes for schema, validation and the pending-command path', async () => {
    const schema = await callMcpTool('blueprint_schema', {});
    const validation = await callMcpTool('validate_blueprint', {
      file: 'blueprints/booking-scheduling.json',
    });
    const pending = await callMcpTool('iterate', { dir: 'demo', patchFile: 'change.json' });

    expect(schema).toMatchObject({ ok: true, command: 'blueprint_schema' });
    expect((schema.data as { $schema: string }).$schema).toMatch(/^https:/);
    expect(validation).toMatchObject({
      ok: true,
      command: 'blueprint validate',
      data: { valid: true },
    });
    expect(pending).toMatchObject({ ok: false, command: 'quick', error: { code: 'usage' } });
  });
});
