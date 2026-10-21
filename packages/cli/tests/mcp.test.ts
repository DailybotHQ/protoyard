// @vitest-environment node
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlayerAssetsManifest } from '../src/lib/quick/player-assets.ts';
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

  it('negotiates the legacy revision through the real child process and keeps diagnostics off stdout', {
    timeout: 60_000,
  }, async () => {
    const run = await runMcpProcess(
      [
        line({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: 'fixture' } },
        }),
        line({ jsonrpc: '2.0', method: 'notifications/initialized' }),
        line({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'doctor', arguments: {} },
        }),
      ].join(''),
      { cwd: ws.root }
    );

    expect(run).toMatchObject({ status: 0, signal: null, timedOut: false, stderr: '' });
    const result = frames(run.stdout);
    expect(result).toHaveLength(2);
    expect(frameAt(result, 0)).toMatchObject({
      id: 1,
      result: { protocolVersion: LEGACY, capabilities: { tools: { listChanged: false } } },
    });
    const doctorText = contentText(frameAt(result, 1));
    expect(JSON.parse(doctorText)).toMatchObject({ ok: true, command: 'doctor' });
  });
});
