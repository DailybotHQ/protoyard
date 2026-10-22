// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBlueprint } from '@protoyard/blueprint';
import { describe, expect, it } from 'vitest';
import { appComponent, emitPrototype } from '../src/lib/codegen/emit.ts';
import { checkHeader } from '../src/lib/codegen/header.ts';

/**
 * ADR-029: a generated prototype renders the shared app shell
 * (`@protoyard/crud/app`) from its blueprint, the same one the player runs.
 * The generator emits data modules and an owned App.svelte; it emits no routes,
 * layout or screen wrappers, so the two levels cannot drift.
 */

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const catalog = readdirSync(join(ROOT, 'blueprints'))
  .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
  .sort();
const generatedPrototypes = readdirSync(join(ROOT, 'prototypes'))
  .filter((slug) => existsSync(join(ROOT, 'prototypes', slug, 'blueprint.json')))
  // App codegen only: deck, page and doc prototypes are covered by generate-kinds.test.ts.
  .filter((slug) => {
    const { kind } = JSON.parse(
      readFileSync(join(ROOT, 'prototypes', slug, 'blueprint.json'), 'utf8')
    ) as { kind?: string };
    return kind === undefined || kind === 'app';
  })
  .sort();

const GENERATED = [
  'src/generated/blueprint.ts',
  'src/generated/schema.ts',
  'src/generated/policy.ts',
  'src/generated/services.ts',
  'src/generated/scenarios.ts',
];
const OWNED = [
  'blueprint.json',
  'src/App.svelte',
  'tests/generators.test.ts',
  'tests/services.test.ts',
  'README.md',
];

function emit(raw: unknown) {
  return emitPrototype(parseBlueprint(raw), 'model-check', JSON.stringify(raw));
}

describe('codegen emits data modules and the shared app shell', () => {
  it.each(catalog)('emits no routes, layout or screens for %s', (file) => {
    const raw = JSON.parse(readFileSync(join(ROOT, 'blueprints', file), 'utf8'));
    const files = emit(raw);
    const paths = files.map((f) => f.path);
    for (const path of [...GENERATED, ...OWNED]) expect(paths, path).toContain(path);
    expect(
      paths.filter((p) => /generated\/(routes|layout)\.ts$|generated\/screens\//.test(p))
    ).toEqual([]);
    expect(paths).not.toContain('src/screens/Home.svelte');
    for (const f of files.filter((f) => f.generated)) {
      expect(checkHeader(f.content), f.path).toEqual({ generated: true, intact: true });
    }
    // Every catalog blueprint has a built brand: it gets a theme module and a prototype.ts.
    expect(paths).toContain('src/generated/brand-theme.ts');
    expect(files.find((f) => f.path === 'src/prototype.ts')?.content).toContain(
      'generatorVersion: blueprintGeneratorVersion(blueprint)'
    );
  });

  it('renders BlueprintApp lazily from the generated blueprint, the same app as the template', () => {
    const app = appComponent();
    expect(app).toContain("import { blueprint } from './generated/blueprint.ts';");
    expect(app).toContain("import('@protoyard/crud/app')");
    expect(app).toContain('<BlueprintApp {blueprint} {themeLibrary} />');
    expect(app).not.toMatch(/from '@protoyard\/crud\/app'/); // never a static import
    expect(readFileSync(join(ROOT, 'templates/crud-app/src/App.svelte'), 'utf8')).toBe(app);
  });

  it('keeps every generated prototype in sync with what the generator emits', () => {
    expect(generatedPrototypes.length).toBeGreaterThanOrEqual(4);
    for (const slug of generatedPrototypes) {
      const dir = join(ROOT, 'prototypes', slug);
      const files = emit(JSON.parse(readFileSync(join(dir, 'blueprint.json'), 'utf8')));
      for (const f of files.filter((f) => f.generated)) {
        expect(readFileSync(join(dir, f.path), 'utf8'), `${slug} ${f.path}`).toBe(f.content);
      }
      for (const retired of [
        'src/generated/routes.ts',
        'src/generated/layout.ts',
        'src/generated/screens',
      ]) {
        expect(existsSync(join(dir, retired)), `${slug} ${retired}`).toBe(false);
      }
      // Owned apps may customize BlueprintApp, but every one renders it.
      expect(readFileSync(join(dir, 'src/App.svelte'), 'utf8'), slug).toContain('<BlueprintApp');
    }
  });
});
