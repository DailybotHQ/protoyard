// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Envelope } from '../src/lib/output.ts';
import { canonicalPath, resolveWorkspaceRoot } from '../src/lib/paths.ts';
import { callMcpTool, createMcpToolHandler, MCP_TOOLS } from '../src/mcp/tools.ts';

/**
 * MCP kind surface (Task 145 / T-kinds-doctor-mcp):
 * - `quick.kind` forces the synthesizer kind for a brief
 * - `blueprint_schema` returns the kind-union schema
 * - `validate_blueprint` returns the kind summary
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));

function success(command: string, data: unknown): Envelope {
  return { ok: true, command, data };
}

describe('MCP kind tools (T-kinds-doctor-mcp)', () => {
  it('advertises kind on the quick tool schema as app|deck|page|doc', () => {
    const quick = MCP_TOOLS.find((tool) => tool.name === 'quick');
    expect(quick).toBeDefined();
    const props = quick?.inputSchema.properties as Record<string, { enum?: string[] }>;
    expect(props.kind).toEqual({ type: 'string', enum: ['app', 'deck', 'page', 'doc'] });
  });

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

  it('rejects kind without a brief and an unknown kind value', async () => {
    const handler = createMcpToolHandler({
      runCli: async () => success('unused', {}),
    });
    const withBlueprint = await handler('quick', {
      blueprint: 'idea.json',
      kind: 'deck',
    });
    expect(withBlueprint).toMatchObject({
      ok: false,
      command: 'quick',
      error: { code: 'validation' },
    });

    const badKind = await handler('quick', {
      brief: 'A landing page for a fictional clinic.',
      kind: 'slides',
    });
    expect(badKind).toMatchObject({
      ok: false,
      command: 'quick',
      error: { code: 'validation' },
    });
  });

  it('returns the published kind-union schema from blueprint_schema', async () => {
    const schema = await callMcpTool('blueprint_schema', {});
    expect(schema).toMatchObject({ ok: true, command: 'blueprint_schema' });
    const data = schema.data as {
      $schema?: string;
      oneOf?: unknown[];
      $defs?: Record<string, unknown>;
    };
    expect(data.$schema).toMatch(/draft\/2020-12/);
    expect(Array.isArray(data.oneOf)).toBe(true);
    expect((data.oneOf ?? []).length).toBeGreaterThanOrEqual(4);
    // Each content kind is a branch of the published union (app + deck + page + doc).
    const encoded = JSON.stringify(data);
    expect(encoded).toContain('"deck"');
    expect(encoded).toContain('"page"');
    expect(encoded).toContain('"doc"');
  });

  it('returns the kind summary from validate_blueprint for a deck fixture', async () => {
    // Path is workspace-relative so MCP path policy accepts it.
    const file = 'packages/blueprint/tests/fixtures/kinds/intro.deck.json';
    expect(readFileSync(join(REPO, file), 'utf8').length).toBeGreaterThan(10);
    const result = await callMcpTool('validate_blueprint', { file });
    expect(result).toMatchObject({
      ok: true,
      command: 'blueprint validate',
      data: { valid: true, kind: 'deck' },
    });
    expect(result.data).toMatchObject({
      slides: expect.any(Number),
      blocks: expect.any(Number),
      interactiveBlocks: expect.any(Number),
    });
  });
});
