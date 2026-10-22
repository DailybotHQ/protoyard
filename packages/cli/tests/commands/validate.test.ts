// @vitest-environment node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkFixtureHygiene, listFixtureScanFiles } from '../../src/commands/validate.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from '../helpers.ts';

describe('checkFixtureHygiene', () => {
  let ws: TempWorkspace;
  beforeEach(() => {
    ws = createWorkspace();
  });
  afterEach(() => ws.cleanup());

  function writeFixture(slug: string, relativePath: string, body: string) {
    addPrototype(ws, slug);
    const file = join(ws.root, 'prototypes', slug, relativePath);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, body);
    return join(ws.root, 'prototypes', slug);
  }

  it('lists scenario sources and skips when none exist', async () => {
    addPrototype(ws, 'empty-app');
    const dir = join(ws.root, 'prototypes', 'empty-app');
    expect(listFixtureScanFiles(dir)).toEqual([]);
    expect(await checkFixtureHygiene(dir)).toMatchObject({
      id: 'fixtures',
      status: 'skip',
    });
  });

  it('passes clean fictional fixture sources without rewriting them', async () => {
    const body = "export const email = 'ops@example.com';\n";
    const dir = writeFixture('clean-app', 'src/scenarios/generators.ts', body);
    const before = body;
    const result = await checkFixtureHygiene(dir);
    expect(result).toMatchObject({ id: 'fixtures', status: 'pass' });
    expect(result.details[0]).toMatch(/scanned 1 file/);
    // Read-only: source content is unchanged.
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(join(dir, 'src/scenarios/generators.ts'), 'utf8')).toBe(before);
  });

  it('fails on real-looking emails and secret shapes with actionable paths', async () => {
    const dir = writeFixture(
      'leaky-app',
      'src/scenarios/seed.ts',
      [
        "const lead = 'lead@gmail.com';",
        `const token = '${['xox', 'b-1234567890-abcdef'].join('')}';`,
        '',
      ].join('\n')
    );
    const result = await checkFixtureHygiene(dir);
    expect(result.status).toBe('fail');
    expect(result.details.some((d) => d.includes('gmail.com'))).toBe(true);
    expect(result.details.some((d) => /Slack token/i.test(d))).toBe(true);
    // Never echo the credential material itself.
    expect(result.details.join('\n')).not.toMatch(/xoxb-1234567890/); // fake planted token
    expect(result.details.join('\n')).toMatch(/file:src\/scenarios\/seed\.ts:\d+/);
  });

  it('surfaces the fixtures check through protoyard validate --json', async () => {
    const slug = 'validate-fixtures';
    writeFixture(slug, 'src/scenarios/generators.ts', "export const bad = 'person@company.io';\n");
    // Minimal contract files so validate gets past the folder contract.
    const base = `prototypes/${slug}`;
    ws.write(`${base}/package.json`, {
      name: `@prototype/${slug}`,
      private: true,
      scripts: { dev: 'vite', build: 'vite build', typecheck: 'tsc' },
    });
    for (const file of [
      'index.html',
      'vite.config.ts',
      'tsconfig.json',
      'src/main.ts',
      'src/prototype.ts',
      'src/App.svelte',
      'src/app.css',
      'src/database/schema.ts',
      'src/scenarios/index.ts',
    ]) {
      ws.write(`${base}/${file}`, file.endsWith('.json') ? '{}' : '// fixture\n');
    }

    const run = await cli(['--root', ws.root, '--json', 'validate', slug, '--skip-typecheck']);
    const payload = run.json<{
      data: { checks: { id: string; status: string; details: string[] }[] };
    }>();
    const fixtures = payload.data.checks.find((c) => c.id === 'fixtures');
    expect(fixtures?.status).toBe('fail');
    expect(fixtures?.details.join(' ')).toMatch(/company\.io/);
    // Source file was not mutated by validate.
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(join(ws.root, base, 'src/scenarios/generators.ts'), 'utf8')).toContain(
      'person@company.io'
    );
  });
});
