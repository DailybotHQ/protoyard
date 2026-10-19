// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseTemplateHeader } from '../src/lib/ci-templates.ts';
import {
  addBuildablePrototype,
  addPrototype,
  cli,
  createWorkspace,
  type TempWorkspace,
} from './helpers.ts';

let ws: TempWorkspace | undefined;
afterEach(() => {
  ws?.cleanup();
  ws = undefined;
});

describe('protoyard export --all', () => {
  it('exports every prototype sequentially and lists zip + sha256 per slug', async () => {
    ws = createWorkspace();
    addBuildablePrototype(ws, 'alpha-app', 'alpha');
    addBuildablePrototype(ws, 'beta-app', 'beta');
    // templates must never be exported by --all
    ws.write('templates/blank/protoyard.json', {
      id: 'template.blank',
      slug: 'blank',
      kind: 'template',
      name: 'Blank',
      version: '0.1.0',
      category: 'other',
      tags: [],
      platform: 'responsive',
      status: 'stable',
      template: 'blank',
      storage: { namespace: 'blank', schemaVersion: 1 },
      scenarios: [],
    });

    const run = await cli(['--root', ws.root, '--json', 'export', '--all']);
    expect(run.code).toBe(0);
    const body = run.json<{
      ok: boolean;
      data: {
        total: number;
        failed: number;
        results: Array<{
          slug: string;
          ok: boolean;
          zip?: string;
          sha256?: string;
          size?: number;
        }>;
      };
    }>();
    expect(body.ok).toBe(true);
    expect(body.data.failed).toBe(0);
    // prototypes only — blank template is ignored
    expect(body.data.total).toBe(2);
    expect(body.data.results.map((r) => r.slug).sort()).toEqual(['alpha-app', 'beta-app']);
    for (const r of body.data.results) {
      expect(r.ok).toBe(true);
      expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(r.zip).toMatch(new RegExp(`artifacts/${r.slug}/${r.slug}\\.zip`));
      expect(existsSync(join(ws.root, r.zip!))).toBe(true);
      expect(readFileSync(join(ws.root, r.zip!)).length).toBe(r.size);
    }
  }, 120_000);

  it('continues past failures and exits 1 when any export failed', async () => {
    ws = createWorkspace();
    addBuildablePrototype(ws, 'good-app', 'ok');
    addPrototype(ws, 'broken-app');
    // No vite.config → build/export fails
    ws.write('prototypes/broken-app/src/main.ts', 'export const x = 1;\n');

    const run = await cli(['--root', ws.root, '--json', 'export', '--all']);
    expect(run.code).toBe(1);
    const body = run.json<{
      ok: boolean;
      data: {
        total: number;
        failed: number;
        results: Array<{ slug: string; ok: boolean; error?: string; zip?: string }>;
      };
    }>();
    expect(body.ok).toBe(false);
    expect(body.data.total).toBe(2);
    expect(body.data.failed).toBe(1);
    const good = body.data.results.find((r) => r.slug === 'good-app');
    const bad = body.data.results.find((r) => r.slug === 'broken-app');
    expect(good?.ok).toBe(true);
    expect(good?.zip).toBeTruthy();
    expect(bad?.ok).toBe(false);
    expect(bad?.error).toBeTruthy();
  }, 120_000);

  it('refuses combining a slug with --all', async () => {
    ws = createWorkspace();
    addBuildablePrototype(ws, 'solo-app');
    const run = await cli(['--root', ws.root, '--json', 'export', 'solo-app', '--all']);
    expect(run.code).toBe(2);
    expect(run.json().ok).toBe(false);
  });
});

describe('protoyard-build template v2', () => {
  it('ships build template header v3 that documents export --all', () => {
    const path = join(process.cwd(), 'packages/cli/ci-templates/github/protoyard-build.yml');
    const content = readFileSync(path, 'utf8');
    const header = parseTemplateHeader(content);
    expect(header).toEqual({ id: 'build', version: 3 });
    expect(content).toContain('pnpm protoyard export --all --skip-build');
    expect(content).toContain('pnpm protoyard build --all');
  });
});
