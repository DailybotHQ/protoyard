// @vitest-environment node
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkHeader } from '../src/lib/codegen/header.ts';
import { checkBlueprintDrift } from '../src/lib/codegen/regenerate.ts';
import {
  biomeCheck,
  biomeFormatCheck,
  cli,
  createWorkspace,
  type TempWorkspace,
} from './helpers.ts';

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
  it('never regenerates a deck through a symlinked src/deck-blueprint.ts or src folder', async () => {
    const file = writeFixture('deck');
    expect((await generate('deck-links', '--blueprint', file, '--no-install')).code).toBe(0);
    const outside = mkdtempSync(join(tmpdir(), 'protoyard-kind-outside-'));
    try {
      const target = join(outside, 'target.ts');
      writeFileSync(target, 'outside\n');
      const deckFile = join(ws.root, 'prototypes/deck-links/src/deck-blueprint.ts');
      rmSync(deckFile);
      symlinkSync(target, deckFile);
      for (const flags of [[], ['--force']]) {
        const run = await generate('deck-links', '--blueprint', file, '--no-install', ...flags);
        expect(run.code).not.toBe(0);
        expect(run.json<{ error?: { code: string } }>().error?.code).toBe('unsafe_path');
        expect(readFileSync(target, 'utf8')).toBe('outside\n');
      }

      const src = join(ws.root, 'prototypes/deck-links/src');
      rmSync(src, { recursive: true });
      symlinkSync(outside, src, 'dir');
      const run = await generate('deck-links', '--blueprint', file, '--no-install', '--force');
      expect(run.code).not.toBe(0);
      expect(run.json<{ error?: { code: string } }>().error?.code).toBe('unsafe_path');
      expect(readFileSync(target, 'utf8')).toBe('outside\n');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

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
        ...(kind === 'deck' ? ['src/deck-blueprint.ts'] : []),
        'src/generated/blueprint.ts',
        'src/prototype.ts',
      ]);
      if (kind === 'deck') {
        // The deck template's App reads deck-blueprint.ts: it must show this deck, not the sample.
        const deckModule = read(`prototypes/${slug}/src/deck-blueprint.ts`);
        expect(deckModule).toContain("from './generated/blueprint.ts'");
        expect(checkHeader(deckModule)).toEqual({ generated: true, intact: true });
        expect(existsSync(join(ws.root, 'prototypes', slug, 'src/blueprint.json'))).toBe(false);
      }

      const generatedBlueprint = read(`prototypes/${slug}/src/generated/blueprint.ts`);
      expect(generatedBlueprint).toContain(
        `parse${kind[0]?.toUpperCase()}${kind.slice(1)}Blueprint(`
      );
      // No top-level await outside comments: it deadlocks the single-chunk artifact build.
      expect(generatedBlueprint).not.toMatch(/^(?!\s*(?:\*|\/\/|\/\*)).*\bawait\b/m);
      expect(checkHeader(generatedBlueprint)).toEqual({ generated: true, intact: true });
      const runtime = read(`prototypes/${slug}/src/prototype.ts`);
      expect(runtime).toContain('defineKindRuntime');
      expect(runtime).toContain(`blueprintKind = '${kind}'`);
      expect(checkHeader(runtime)).toEqual({ generated: true, intact: true });
      const formatted = biomeFormatCheck(ws, [
        `prototypes/${slug}/src/generated/blueprint.ts`,
        `prototypes/${slug}/src/prototype.ts`,
        ...(kind === 'deck' ? [`prototypes/${slug}/src/deck-blueprint.ts`] : []),
      ]);
      expect(formatted.code, formatted.output).toBe(0);
      // Generated code must pass the repository's full check (lint and import order), not just formatting.
      const checked = biomeCheck(
        ws,
        first.data.generated.map((path) => `prototypes/${slug}/${path}`)
      );
      expect(checked.code, checked.output).toBe(0);
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

  it.each(Object.keys(FIXTURES) as ContentKind[])(
    'reports a generated %s prototype fresh, then drift after blueprint.json changes',
    async (kind) => {
      const slug = `${kind}-drift`;
      const created = await generate(slug, '--blueprint', writeFixture(kind), '--no-install');
      expect(created.code).toBe(0);
      const dir = join(ws.root, 'prototypes', slug);
      // validate's blueprint check: content kinds parse as their kind, not as an app.
      const fresh = await checkBlueprintDrift(dir, slug, 1);
      expect(fresh.problems).toEqual([]);
      expect(fresh.ok).toBe(true);
      expect(fresh.summary).toContain(`${kind} blueprint, schema v1`);

      const edited = JSON.parse(read(`prototypes/${slug}/blueprint.json`)) as Record<
        string,
        unknown
      >;
      writeFileSync(
        join(dir, 'blueprint.json'),
        `${JSON.stringify({ ...edited, name: 'Edited without regenerating' }, null, 2)}\n`
      );
      const drifted = await checkBlueprintDrift(dir, slug, 1);
      expect(drifted.ok).toBe(false);
      expect(drifted.problems.join('\n')).toMatch(/changed since the last generation/);

      writeFileSync(join(dir, 'blueprint.json'), `${JSON.stringify(edited, null, 2)}\n`);
      writeFileSync(
        join(dir, 'src/prototype.ts'),
        `${read(`prototypes/${slug}/src/prototype.ts`)}// hand edit\n`
      );
      const handEdited = await checkBlueprintDrift(dir, slug, 1);
      expect(handEdited.problems.join('\n')).toMatch(/src\/prototype\.ts was edited by hand/);
    }
  );
});
