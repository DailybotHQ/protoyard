// @vitest-environment node
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkHeader } from '../src/lib/codegen/header.ts';
import { biomeFormatCheck, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

vi.setConfig({ testTimeout: 30_000 });

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FIXTURES = {
  deck: 'packages/blueprint/tests/fixtures/kinds/minimal.deck.json',
  page: 'packages/blueprint/tests/fixtures/kinds/landing.page.json',
  doc: 'packages/blueprint/tests/fixtures/kinds/quarterly-report.doc.json',
} as const;
type ContentKind = keyof typeof FIXTURES;

let ws: TempWorkspace;
beforeEach(() => {
  ws = createWorkspace();
  for (const kind of ['deck', 'page', 'doc'] as const) {
    cpSync(join(REPO_ROOT, 'templates', kind), join(ws.root, 'templates', kind), {
      recursive: true,
      filter: (source) => !/[/\\](node_modules|dist)([/\\]|$)/.test(source),
    });
  }
});
afterEach(() => ws.cleanup());

function writeFixture(kind: ContentKind, filename = `${kind}.json`): string {
  const text = readFileSync(join(REPO_ROOT, FIXTURES[kind]), 'utf8');
  const path = join(ws.root, filename);
  writeFileSync(path, text);
  return path;
}

const generate = (...args: string[]) => cli(['--root', ws.root, '--json', 'generate', ...args]);
const read = (path: string) => readFileSync(join(ws.root, path), 'utf8');

describe('protoyard generate content kinds', () => {
  it.each(Object.keys(FIXTURES) as ContentKind[])(
    'defaults %s blueprints to their matching template and reports the kind',
    async (kind) => {
      const run = await generate(`${kind}-smoke`, '--blueprint', writeFixture(kind), '--dry-run');
      expect(run.code).toBe(0);
      const { data } = run.json<{
        data: { kind: string; template: string; files: { path: string; source: string }[] };
      }>();
      expect(data).toMatchObject({ kind, template: kind });
      expect(data.files).toEqual(
        expect.arrayContaining([
          { path: 'src/generated/blueprint.ts', source: 'generated' },
          { path: 'src/prototype.ts', source: 'generated' },
        ])
      );
      expect(data.files.map((file) => file.path)).not.toEqual(
        expect.arrayContaining([
          'src/generated/schema.ts',
          'src/generated/policy.ts',
          'src/generated/services.ts',
          'src/generated/scenarios.ts',
          'tests/generators.test.ts',
          'tests/services.test.ts',
        ])
      );
      expect(existsSync(join(ws.root, 'prototypes', `${kind}-smoke`))).toBe(false);
    }
  );

  it('refuses a template whose blueprintKind does not match the input', async () => {
    const run = await generate(
      'wrong-kind',
      '--blueprint',
      writeFixture('deck'),
      '--template',
      'page',
      '--dry-run'
    );
    expect(run.code).toBe(4);
    expect(run.json<{ error: { message: string } }>().error.message).toContain(
      'Template "page" is for page blueprints, but this blueprint is deck.'
    );
    expect(existsSync(join(ws.root, 'prototypes/wrong-kind'))).toBe(false);
  });

  it.each(Object.keys(FIXTURES) as ContentKind[])(
    'generates and regenerates %s without entity modules or replacing owned app files',
    async (kind) => {
      const slug = `${kind}-generated`;
      const fixture = writeFixture(kind);
      const created = await generate(slug, '--blueprint', fixture, '--no-install');
      expect(created.code).toBe(0);
      const first = created.json<{
        data: { kind: string; template: string; generated: string[] };
      }>();
      expect(first.data).toMatchObject({ kind, template: kind });
      expect(first.data.generated.sort()).toEqual([
        'src/generated/blueprint.ts',
        'src/prototype.ts',
      ]);

      const generatedBlueprint = read(`prototypes/${slug}/src/generated/blueprint.ts`);
      expect(generatedBlueprint).toContain('parseAnyBlueprint');
      expect(checkHeader(generatedBlueprint)).toEqual({ generated: true, intact: true });
      const runtime = read(`prototypes/${slug}/src/prototype.ts`);
      expect(runtime).toContain('defineKindRuntime');
      expect(runtime).toContain(`blueprintKind = '${kind}'`);
      expect(checkHeader(runtime)).toEqual({ generated: true, intact: true });
      const formatted = biomeFormatCheck(ws, [
        `prototypes/${slug}/src/generated/blueprint.ts`,
        `prototypes/${slug}/src/prototype.ts`,
      ]);
      expect(formatted.code, formatted.output).toBe(0);
      for (const path of [
        'src/generated/schema.ts',
        'src/generated/policy.ts',
        'src/generated/services.ts',
        'src/generated/scenarios.ts',
        'tests/generators.test.ts',
        'tests/services.test.ts',
      ]) {
        expect(existsSync(join(ws.root, 'prototypes', slug, path)), path).toBe(false);
      }

      const appPath = `prototypes/${slug}/src/App.svelte`;
      writeFileSync(join(ws.root, appPath), `${read(appPath)}\n<!-- owned customization -->\n`);
      const customSlidesPath = `prototypes/${slug}/src/custom-slides.ts`;
      if (kind === 'deck') {
        writeFileSync(
          join(ws.root, customSlidesPath),
          `${read(customSlidesPath)}\n// owned slide registry customization\n`
        );
      }
      const ownedApp = read(appPath);
      const ownedSlides = kind === 'deck' ? read(customSlidesPath) : undefined;

      const next = JSON.parse(readFileSync(fixture, 'utf8')) as Record<string, unknown>;
      next.name = `${String(next.name)} Revised`;
      writeFileSync(fixture, `${JSON.stringify(next, null, 2)}\n`);
      const regenerated = await generate(slug, '--blueprint', fixture, '--no-install');
      expect(regenerated.code).toBe(0);
      expect(
        regenerated.json<{ data: { kind: string; regenerated: boolean; schemaVersion: object } }>()
          .data
      ).toMatchObject({ kind, regenerated: true, schemaVersion: { from: 1, to: 1, ops: 0 } });
      expect(read(appPath)).toBe(ownedApp);
      if (ownedSlides !== undefined) expect(read(customSlidesPath)).toBe(ownedSlides);
      expect(checkHeader(read(`prototypes/${slug}/src/prototype.ts`))).toEqual({
        generated: true,
        intact: true,
      });
    }
  );
});
