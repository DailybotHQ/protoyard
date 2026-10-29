// @vitest-environment node
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addPrototype, addTemplate, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

let ws: TempWorkspace;
beforeEach(() => {
  ws = createWorkspace();
  addTemplate(ws, 'blank');
});
afterEach(() => ws.cleanup());

const read = (path: string) => readFileSync(join(ws.root, path), 'utf8');

describe('protoyard new', () => {
  it('copies the template, rewrites identity files and re-indexes', async () => {
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'new',
      'my-crm',
      '--template',
      'blank',
      '--name',
      'My CRM',
      '--description',
      'Sales pipeline',
      '--no-install',
    ]);
    expect(run.code).toBe(0);
    const { ok, data } = run.json<{ ok: boolean; data: Record<string, unknown> }>();
    expect(ok).toBe(true);
    expect(data).toMatchObject({
      slug: 'my-crm',
      id: 'local.my-crm',
      created: true,
      indexed: true,
      path: 'prototypes/my-crm',
    });

    const manifest = JSON.parse(read('prototypes/my-crm/protoyard.json'));
    expect(manifest).toMatchObject({
      id: 'local.my-crm',
      slug: 'my-crm',
      kind: 'prototype',
      name: 'My CRM',
      description: 'Sales pipeline',
      template: 'blank',
      storage: { namespace: 'my-crm', schemaVersion: 1 },
    });
    expect(Date.parse(manifest.createdAt)).not.toBeNaN();
    expect(JSON.parse(read('prototypes/my-crm/package.json')).name).toBe('@prototype/my-crm');
    expect(read('prototypes/my-crm/README.md').split('\n')[0]).toBe('# My CRM');
    expect(existsSync(join(ws.root, 'prototypes/my-crm/src/main.ts'))).toBe(true);
    expect(existsSync(join(ws.root, 'prototypes/my-crm/node_modules'))).toBe(false);
    expect(existsSync(join(ws.root, 'prototypes/my-crm/dist'))).toBe(false);
    // The template itself is untouched.
    expect(JSON.parse(read('templates/blank/protoyard.json')).kind).toBe('template');
  });

  it("drops the template's thumbnail so the new prototype never shows another app", async () => {
    const tpl = join(ws.root, 'templates/blank');
    const manifest = JSON.parse(read('templates/blank/protoyard.json'));
    writeFileSync(
      join(tpl, 'protoyard.json'),
      JSON.stringify({ ...manifest, thumbnail: 'public/thumbnail.png' })
    );
    mkdirSync(join(tpl, 'public'), { recursive: true });
    writeFileSync(join(tpl, 'public/thumbnail.png'), 'png');
    writeFileSync(join(tpl, 'public/logo.svg'), '<svg/>');

    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'new',
      'shot',
      '--template',
      'blank',
      '--no-install',
    ]);
    expect(run.code).toBe(0);
    expect(JSON.parse(read('prototypes/shot/protoyard.json')).thumbnail).toBeUndefined();
    expect(existsSync(join(ws.root, 'prototypes/shot/public/thumbnail.png'))).toBe(false);
    expect(existsSync(join(ws.root, 'prototypes/shot/public/logo.svg'))).toBe(true);
    expect(existsSync(join(tpl, 'public/thumbnail.png'))).toBe(true);
  });

  it('is retry-safe: re-running the same command resumes instead of failing', async () => {
    const args = [
      '--root',
      ws.root,
      '--json',
      'new',
      'again',
      '--template',
      'blank',
      '--no-install',
    ];
    expect((await cli(args)).code).toBe(0);
    const second = await cli(args);
    expect(second.code).toBe(0);
    expect(second.json<{ data: { created: boolean } }>().data.created).toBe(false);
  });

  it('refuses existing folders, and --force only reuses an empty one', async () => {
    ws.write('prototypes/taken/keep.txt', 'mine');
    const taken = await cli([
      '--root',
      ws.root,
      '--json',
      'new',
      'taken',
      '--template',
      'blank',
      '--no-install',
    ]);
    expect(taken.code).toBe(1);
    expect(taken.json<{ error: { code: string } }>().error.code).toBe('conflict');
    const forced = await cli([
      '--root',
      ws.root,
      'new',
      'taken',
      '--template',
      'blank',
      '--no-install',
      '--force',
    ]);
    expect(forced.code).toBe(1);
    expect(read('prototypes/taken/keep.txt')).toBe('mine');

    mkdirSync(join(ws.root, 'prototypes/empty-one'));
    const noForce = await cli([
      '--root',
      ws.root,
      'new',
      'empty-one',
      '--template',
      'blank',
      '--no-install',
    ]);
    expect(noForce.code).toBe(1);
    const withForce = await cli([
      '--root',
      ws.root,
      'new',
      'empty-one',
      '--template',
      'blank',
      '--no-install',
      '--force',
    ]);
    expect(withForce.code).toBe(0);
    expect(existsSync(join(ws.root, 'prototypes/empty-one/protoyard.json'))).toBe(true);
  });

  it('rejects unsafe slugs and unknown templates with distinct exit codes', async () => {
    const traversal = await cli([
      '--root',
      ws.root,
      '--json',
      'new',
      '../escape',
      '--template',
      'blank',
      '--no-install',
    ]);
    expect(traversal.code).toBe(2);
    expect(existsSync(join(ws.root, 'escape'))).toBe(false);
    const reserved = await cli([
      '--root',
      ws.root,
      'new',
      'templates',
      '--template',
      'blank',
      '--no-install',
    ]);
    expect(reserved.code).toBe(2);
    const missing = await cli([
      '--root',
      ws.root,
      '--json',
      'new',
      'fine-slug',
      '--template',
      'nope',
      '--no-install',
    ]);
    expect(missing.code).toBe(3);
    expect(missing.json<{ error: { code: string } }>().error.code).toBe('not_found');
  });

  it('validates the generated manifest (e.g. a too-long name) and leaves nothing behind', async () => {
    const run = await cli([
      '--root',
      ws.root,
      'new',
      'long-name',
      '--template',
      'blank',
      '--no-install',
      '--name',
      'x'.repeat(200),
    ]);
    expect(run.code).toBe(4);
    expect(existsSync(join(ws.root, 'prototypes/long-name'))).toBe(false);
  });
});

describe('new: prototype spec', () => {
  it('still creates the prototype when the spec cannot be filled, and says why', async () => {
    // The fixture template has no src/prototype.ts and no node_modules, so its definition cannot load.
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'new',
      'spec-less',
      '--template',
      'blank',
      '--no-install',
    ]);
    expect(run.code).toBe(0);
    const spec = run.json<{ data: { spec: { ok: boolean; error?: string } } }>().data.spec;
    expect(spec.ok).toBe(false);
    // Outside the repository even the runner (tsx) is missing; any reason is reported.
    expect(spec.error).toEqual(expect.any(String));
    expect(spec.error?.length).toBeGreaterThan(0);
    expect(existsSync(join(ws.root, 'prototypes/spec-less/protoyard.json'))).toBe(true);
  });

  it('fills AGENTS.md and docs/ for the new slug from the real blank template', {
    timeout: 120_000,
  }, async () => {
    // Inside the repository, so the template's @protoyard/* imports resolve from the root node_modules.
    const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
    const root = mkdtempSync(join(repoRoot, 'tmp', 'new-spec-'));
    try {
      writeFileSync(
        join(root, 'pnpm-workspace.yaml'),
        'packages:\n  - prototypes/*\n  - templates/*\n'
      );
      writeFileSync(join(root, 'package.json'), '{"name":"fixture-workspace","private":true}\n');
      mkdirSync(join(root, 'prototypes'));
      cpSync(join(repoRoot, 'templates/blank'), join(root, 'templates/blank'), {
        recursive: true,
        filter: (src) => !/[\\/](node_modules|dist)([\\/]|$)/.test(src),
      });
      const run = await cli([
        '--root',
        root,
        '--json',
        'new',
        'my-notes',
        '--template',
        'blank',
        '--name',
        'My Notes',
        '--no-install',
      ]);
      expect(run.code, run.stdout).toBe(0);
      const spec = run.json<{ data: { spec: { ok: boolean; created: number; updated: number } } }>()
        .data.spec;
      expect(spec).toMatchObject({ ok: true, created: 0 });
      expect(spec.updated).toBeGreaterThan(0);

      const dir = join(root, 'prototypes/my-notes');
      const read = (file: string) => readFileSync(join(dir, file), 'utf8');
      expect(read('AGENTS.md').split('\n')[0]).toBe('# AGENTS.md — My Notes (`my-notes`)');
      expect(read('docs/SPEC.md').split('\n')[0]).toBe('# My Notes: spec');
      expect(read('docs/DATA_MODEL.md').split('\n')[0]).toBe('# My Notes: data model');
      // Generated regions now describe the new prototype, not the template.
      expect(read('AGENTS.md')).toContain('pnpm protoyard dev my-notes');
      expect(read('docs/SPEC.md')).toContain('| id | `local.my-notes` |');
      expect(read('docs/SPEC.md')).not.toContain('`template.blank`');
      // Template prose prompts are kept for the author.
      expect(read('docs/SPEC.md')).toContain('TODO: the product problem');

      const check = await cli(['--root', root, '--json', 'spec', 'my-notes', '--check']);
      expect(check.code, check.stdout).toBe(0);
      // The template's own docs are untouched.
      expect(readFileSync(join(root, 'templates/blank/AGENTS.md'), 'utf8')).toContain('`blank`');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('new --from', () => {
  const read = (path: string) => readFileSync(join(ws.root, path), 'utf8');

  it('copies a template with --from like --template', async () => {
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'new',
      'from-tpl',
      '--from',
      'blank',
      '--no-install',
    ]);
    expect(run.code, run.stdout).toBe(0);
    expect(run.json<{ data: Record<string, unknown> }>().data).toMatchObject({
      source: { kind: 'template', slug: 'blank' },
      template: 'blank',
      path: 'prototypes/from-tpl',
    });
    expect(JSON.parse(read('prototypes/from-tpl/protoyard.json'))).toMatchObject({
      template: 'blank',
      kind: 'prototype',
    });
  });

  it('remixes an existing prototype: new id, name and storage namespace, source untouched', async () => {
    addPrototype(ws, 'source-app', {
      name: 'Source App',
      template: 'blank',
      storage: { namespace: 'source-app', schemaVersion: 1 },
    });
    ws.write('prototypes/source-app/src/main.ts', 'export {};\n');
    const before = read('prototypes/source-app/protoyard.json');
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'new',
      'remix-app',
      '--from',
      'source-app',
      '--no-install',
    ]);
    expect(run.code, run.stdout).toBe(0);
    expect(run.json<{ data: Record<string, unknown> }>().data).toMatchObject({
      source: { kind: 'prototype', slug: 'source-app' },
      template: 'blank',
      id: 'local.remix-app',
    });
    expect(JSON.parse(read('prototypes/remix-app/protoyard.json'))).toMatchObject({
      id: 'local.remix-app',
      slug: 'remix-app',
      name: 'Remix App',
      template: 'blank',
      storage: { namespace: 'remix-app' },
    });
    expect(read('prototypes/remix-app/src/main.ts')).toBe('export {};\n');
    expect(read('prototypes/source-app/protoyard.json')).toBe(before);
  });

  it('refuses an existing slug, traversal, both or neither source flag', async () => {
    addPrototype(ws, 'taken-app');
    const before = read('prototypes/taken-app/protoyard.json');
    expect(
      (
        await cli([
          '--root',
          ws.root,
          '--json',
          'new',
          'taken-app',
          '--from',
          'blank',
          '--no-install',
        ])
      ).code
    ).toBe(1);
    expect(read('prototypes/taken-app/protoyard.json')).toBe(before);
    expect(
      (
        await cli([
          '--root',
          ws.root,
          '--json',
          'new',
          '../escape',
          '--from',
          'blank',
          '--no-install',
        ])
      ).code
    ).toBe(2);
    expect(
      (
        await cli([
          '--root',
          ws.root,
          '--json',
          'new',
          'ok-app',
          '--from',
          '../../etc',
          '--no-install',
        ])
      ).code
    ).toBe(2);
    expect(
      (
        await cli([
          '--root',
          ws.root,
          '--json',
          'new',
          'ok-app',
          '--from',
          'blank',
          '--template',
          'blank',
        ])
      ).code
    ).toBe(2);
    expect((await cli(['--root', ws.root, '--json', 'new', 'ok-app', '--no-install'])).code).toBe(
      2
    );
    expect(existsSync(join(ws.root, 'prototypes/ok-app'))).toBe(false);
  });
});

describe('protoyard new: the deck template brand', () => {
  const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
  const copyDeckTemplate = () =>
    cpSync(join(REPO_ROOT, 'templates/deck'), join(ws.root, 'templates/deck'), {
      recursive: true,
      filter: (source) => !/[/\\](node_modules|dist)([/\\]|$)/.test(source),
    });
  const newDeck = (slug: string) =>
    cli(['--root', ws.root, '--json', 'new', slug, '--template', 'deck', '--no-install']);

  it('resolves src/brand-theme.ts from the copied blueprint at scaffold time', async () => {
    copyDeckTemplate();
    expect((await newDeck('my-deck')).code).toBe(0);
    // The template's own module is what scaffolding writes for the same blueprint.
    expect(read('prototypes/my-deck/src/brand-theme.ts')).toBe(
      readFileSync(join(REPO_ROOT, 'templates/deck/src/brand-theme.ts'), 'utf8')
    );

    const path = join(ws.root, 'templates/deck/src/blueprint.json');
    const blueprint = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(
      path,
      JSON.stringify({ ...blueprint, brand: { libraryTheme: 'fintech-ledger' } })
    );
    expect((await newDeck('library-deck')).code).toBe(0);
    const library = read('prototypes/library-deck/src/brand-theme.ts');
    expect(library).toContain('export const brandTheme: Theme | null = null;');
    expect(library).toContain("export const defaultThemeId: string | null = 'fintech-ledger';");
    expect(library).not.toContain('defineTheme');
  });

  it('refuses a deck template whose brand names an unknown library theme', async () => {
    copyDeckTemplate();
    const path = join(ws.root, 'templates/deck/src/blueprint.json');
    const blueprint = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify({ ...blueprint, brand: { libraryTheme: 'no-such-theme' } }));
    const run = await newDeck('bad-deck');
    expect(run.code).not.toBe(0);
    expect(run.json<{ error: { message: string } }>().error.message).toMatch(
      /Unknown library theme "no-such-theme"/
    );
    expect(existsSync(join(ws.root, 'prototypes/bad-deck'))).toBe(false);
  });
});
