// @vitest-environment node
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveAppModel, parseBlueprint } from '@protoyard/blueprint';
import { getScreenKindMetadata } from '@protoyard/crud/registry-meta';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitPrototype, personalizeHtml } from '../src/lib/codegen/emit.ts';
import { formatJson, formatTs, tsString } from '../src/lib/codegen/format.ts';
import { checkHeader, withHeader } from '../src/lib/codegen/header.ts';
import {
  addCrudTemplate,
  biomeFormatCheck,
  cli,
  createWorkspace,
  helpdeskBlueprint,
  linkInstalled,
  type TempWorkspace,
} from './helpers.ts';

// Each test runs a real generate (file writes, codegen, sometimes a build). That
// takes 1.5 to 3 s alone and much longer while the whole CLI suite runs in parallel.
vi.setConfig({ testTimeout: 30_000 });

let ws: TempWorkspace;
beforeEach(() => {
  ws = createWorkspace();
  addCrudTemplate(ws);
});
afterEach(() => ws.cleanup());

const read = (path: string) => readFileSync(join(ws.root, path), 'utf8');

const blueprintInput = helpdeskBlueprint;

function writeBlueprint(input: unknown = blueprintInput(), name = 'helpdesk.json') {
  ws.write(name, input as string | object);
  return join(ws.root, name);
}

const generate = (...args: string[]) => cli(['--root', ws.root, '--json', 'generate', ...args]);

type Envelope = {
  ok: boolean;
  data: Record<string, unknown> & { files: { path: string; source: string }[] };
  error?: { code: string; message: string };
};

describe('protoyard generate', () => {
  it('lists the files on --dry-run and writes nothing', async () => {
    const run = await generate('help-desk', '--blueprint', writeBlueprint(), '--dry-run');
    expect(run.code).toBe(0);
    const { data } = run.json<Envelope>();
    expect(data).toMatchObject({
      dryRun: true,
      template: 'crud-app',
      entities: ['customer', 'support-ticket'],
    });
    const paths = data.files.map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'blueprint.json',
        'src/generated/schema.ts',
        'src/generated/policy.ts',
        'src/generated/services.ts',
        'src/generated/scenarios.ts',
        'src/App.svelte',
        'tests/services.test.ts',
        'protoyard.json',
      ])
    );
    expect(paths).not.toContain('src/screens/ProjectsPage.svelte');
    // The shared app shell derives routes, layout and screens: none are emitted (ADR-029).
    expect(
      paths.filter((p) => /generated\/(routes|layout)\.ts$|generated\/screens\//.test(p))
    ).toEqual([]);
    // Template tests target the template's entities; only blueprint-driven tests are emitted.
    expect(paths.filter((p) => p.startsWith('tests/')).sort()).toEqual([
      'tests/generators.test.ts',
      'tests/services.test.ts',
    ]);
    expect(existsSync(join(ws.root, 'prototypes/help-desk'))).toBe(false);
  });

  it('rejects an invalid blueprint with exit 4 and path-specific messages', async () => {
    const bad = blueprintInput();
    (bad.entities[1] as Record<string, unknown>).titleField = 'headline';
    const run = await generate('help-desk', '--blueprint', writeBlueprint(bad));
    expect(run.code).toBe(4);
    const { ok, error, data } = run.json<Envelope>();
    expect(ok).toBe(false);
    expect(error?.message).toBe(
      'Invalid blueprint: entities.1.titleField — titleField "headline" is not a field of "support-ticket"'
    );
    expect((data as unknown as { issues: unknown }).issues).toEqual([
      {
        path: 'entities.1.titleField',
        message: 'titleField "headline" is not a field of "support-ticket"',
      },
    ]);

    const notJson = await generate(
      'help-desk',
      '--blueprint',
      writeBlueprint('{ nope', 'bad.json')
    );
    expect(notJson.code).toBe(4);
    const missing = await generate('help-desk', '--blueprint', join(ws.root, 'missing.json'));
    expect(missing.code).toBe(3);
    expect(existsSync(join(ws.root, 'prototypes/help-desk'))).toBe(false);
  });

  it('generates a prototype with hash-headed modules, a derived manifest and the shared app shell', async () => {
    const run = await generate('help-desk', '--blueprint', writeBlueprint(), '--no-install');
    expect(run.code).toBe(0);
    const { data } = run.json<Envelope>();
    expect(data).toMatchObject({
      created: true,
      unchanged: false,
      indexed: true,
      hashesIntact: true,
    });

    const manifest = JSON.parse(read('prototypes/help-desk/protoyard.json'));
    const templateManifest = JSON.parse(read('templates/crud-app/protoyard.json'));
    expect(manifest).toMatchObject({
      id: 'local.help-desk',
      slug: 'help-desk',
      kind: 'prototype',
      name: 'Help <desk> & "co"',
      template: 'crud-app',
      storage: { namespace: 'help-desk', schemaVersion: 1 },
      scenarios: templateManifest.scenarios,
    });
    expect(manifest.preview.shell).toBeUndefined();
    expect(JSON.parse(read('prototypes/help-desk/package.json')).name).toBe('@prototype/help-desk');
    expect(JSON.parse(read('prototypes/help-desk/blueprint.json'))).toEqual(blueprintInput());

    for (const path of data.generated as string[]) {
      expect(checkHeader(read(`prototypes/help-desk/${path}`)), path).toEqual({
        generated: true,
        intact: true,
      });
    }
    expect(existsSync(join(ws.root, 'prototypes/help-desk/src/screens/ProjectsPage.svelte'))).toBe(
      false
    );
    // Routes come from the blueprint at runtime: the app lazily renders BlueprintApp.
    expect(existsSync(join(ws.root, 'prototypes/help-desk/src/generated/routes.ts'))).toBe(false);
    expect(read('prototypes/help-desk/src/App.svelte')).toContain("import('@protoyard/crud/app')");
    expect(read('prototypes/help-desk/src/App.svelte')).toContain(
      '<BlueprintApp {blueprint} {themeLibrary} />'
    );
    const html = read('prototypes/help-desk/index.html');
    expect(html).toContain('<title>Help &lt;desk&gt; &amp; &quot;co&quot;</title>');
    expect(html).toContain('content="Customers and tickets: it&#39;s fictional."');
    // The bell is the shell's choice: it shows only when an entity enables notifications
    // (packages/crud/tests/blueprint-app.test.ts), so the app never names it.
    expect(read('prototypes/help-desk/src/App.svelte')).not.toContain('NotificationsBell');
  });

  it('wires an optional blueprint brand into the default theme (AA, hash-headed)', async () => {
    const file = writeBlueprint(
      blueprintInput({
        brand: {
          id: 'acme-teal',
          name: 'Acme Teal',
          seed: '#0f766e',
          styleProfile: 'soft',
          font: 'grotesk',
        },
      }),
      'branded.json'
    );
    const run = await generate('branded-desk', '--blueprint', file, '--no-install');
    expect(run.code).toBe(0);
    const { data } = run.json<Envelope>();
    expect(data.hashesIntact).toBe(true);
    expect(data.generated as string[]).toContain('src/generated/brand-theme.ts');

    const manifest = JSON.parse(read('prototypes/branded-desk/protoyard.json'));
    expect(manifest.defaultTheme).toBe('acme-teal');

    const themeModule = read('prototypes/branded-desk/src/generated/brand-theme.ts');
    expect(checkHeader(themeModule)).toEqual({ generated: true, intact: true });
    expect(themeModule).toContain('acmeTealTheme');
    expect(themeModule).toContain("id: 'acme-teal'");

    const prototype = read('prototypes/branded-desk/src/prototype.ts');
    expect(prototype).toContain("from './generated/brand-theme.ts'");
    expect(prototype).toContain('themes: [acmeTealTheme]');

    // Same blueprint again is a no-op (hash guard).
    const again = await generate('branded-desk', '--blueprint', file, '--no-install');
    expect(again.code).toBe(0);
    expect(again.json<Envelope>().data).toMatchObject({ created: false, unchanged: true });

    // Without brand, the template default theme is left alone.
    const plain = await generate(
      'plain-desk',
      '--blueprint',
      writeBlueprint(blueprintInput(), 'plain.json'),
      '--no-install'
    );
    expect(plain.code).toBe(0);
    const plainManifest = JSON.parse(read('prototypes/plain-desk/protoyard.json'));
    const templateManifest = JSON.parse(read('templates/crud-app/protoyard.json'));
    expect(plainManifest.defaultTheme).toBe(templateManifest.defaultTheme);
    expect(existsSync(join(ws.root, 'prototypes/plain-desk/src/generated/brand-theme.ts'))).toBe(
      false
    );
  });

  it('generates a valid brand theme for a product name starting with a digit', async () => {
    const file = writeBlueprint(
      blueprintInput({ name: '3D Print Shop', brand: { seed: '#0f766e' } }),
      'print.json'
    );
    const run = await generate('print-shop', '--blueprint', file, '--no-install');
    expect(run.code).toBe(0);
    expect(JSON.parse(read('prototypes/print-shop/protoyard.json')).defaultTheme).toBe(
      'brand-3d-print-shop'
    );
    const themeModule = read('prototypes/print-shop/src/generated/brand-theme.ts');
    expect(themeModule).toContain('export const brand3dPrintShopTheme: Theme');
    expect(read('prototypes/print-shop/src/prototype.ts')).toContain(
      'themes: [brand3dPrintShopTheme]'
    );

    // A brand id ending in a hyphen is a validation error (exit 4), never a broken module.
    const bad = await generate(
      'bad-brand',
      '--blueprint',
      writeBlueprint(blueprintInput({ brand: { id: 'acme-', seed: '#0f766e' } }), 'bad.json'),
      '--no-install'
    );
    expect(bad.code).toBe(4);
    expect(bad.json<Envelope>().error?.message).toMatch(/brand\.id/);
    expect(existsSync(join(ws.root, 'prototypes/bad-brand'))).toBe(false);
  });

  it('ships a brand libraryTheme by id: defaultTheme set, no brand-theme.ts', async () => {
    const file = writeBlueprint(
      blueprintInput({ brand: { name: 'Acme Ledger', libraryTheme: 'fintech-ledger' } }),
      'library.json'
    );
    const run = await generate('ledger-desk', '--blueprint', file, '--no-install');
    expect(run.code).toBe(0);
    const { data } = run.json<Envelope>();
    expect(data.hashesIntact).toBe(true);
    expect(data.generated as string[]).not.toContain('src/generated/brand-theme.ts');

    const manifest = JSON.parse(read('prototypes/ledger-desk/protoyard.json'));
    expect(manifest.defaultTheme).toBe('fintech-ledger');
    expect(existsSync(join(ws.root, 'prototypes/ledger-desk/src/generated/brand-theme.ts'))).toBe(
      false
    );
    // The template's own prototype.ts stays: no brand theme to register.
    expect(read('prototypes/ledger-desk/src/prototype.ts')).toBe(
      read('templates/crud-app/src/prototype.ts')
    );

    const emitted = emitPrototype(
      parseBlueprint(blueprintInput({ brand: { libraryTheme: 'fintech-ledger' } })),
      'ledger-desk',
      '{}'
    ).map((f) => f.path);
    expect(emitted).not.toContain('src/generated/brand-theme.ts');
    expect(emitted).not.toContain('src/prototype.ts');
  });

  it('rejects a brand libraryTheme the library does not know', async () => {
    const file = writeBlueprint(
      blueprintInput({ brand: { libraryTheme: 'fintech-ledgr' } }),
      'unknown-library.json'
    );
    const run = await generate('ledger-typo', '--blueprint', file, '--dry-run');
    expect(run.code).not.toBe(0);
    expect(run.json<Envelope>().error?.message ?? run.stdout).toMatch(/fintech-ledger/);
    expect(existsSync(join(ws.root, 'prototypes/ledger-typo'))).toBe(false);
  });

  it('is a no-op for the same blueprint and refuses hand-edited generated files', async () => {
    const file = writeBlueprint();
    expect((await generate('help-desk', '--blueprint', file, '--no-install')).code).toBe(0);
    const policy = join(ws.root, 'prototypes/help-desk/src/generated/policy.ts');
    const before = statSync(policy).mtimeMs;

    const again = await generate('help-desk', '--blueprint', file, '--no-install');
    expect(again.code).toBe(0);
    expect(again.json<Envelope>().data).toMatchObject({ created: false, unchanged: true });
    expect(statSync(policy).mtimeMs).toBe(before);

    writeFileSync(policy, `${readFileSync(policy, 'utf8')}// edited\n`);
    expect(checkHeader(readFileSync(policy, 'utf8')).intact).toBe(false);
    const blocked = await generate(
      'help-desk',
      '--blueprint',
      writeBlueprint(blueprintInput({ name: 'Another desk' }), 'other.json')
    );
    expect(blocked.code).toBe(1);
    const envelope = blocked.json<
      Envelope & { data: { files: { path: string; status: string }[] } }
    >();
    expect(envelope.error?.code).toBe('conflict');
    expect(envelope.data.files).toContainEqual({
      path: 'src/generated/policy.ts',
      status: 'conflicted',
    });
    // Blocked means nothing was written.
    expect(JSON.parse(read('prototypes/help-desk/blueprint.json')).name).toBe('Help <desk> & "co"');
    expect(read('prototypes/help-desk/src/generated/policy.ts')).toContain('// edited');

    const forced = await generate(
      'help-desk',
      '--blueprint',
      join(ws.root, 'other.json'),
      '--force'
    );
    expect(forced.code).toBe(0);
    expect(checkHeader(read('prototypes/help-desk/src/generated/policy.ts')).intact).toBe(true);
    expect(JSON.parse(read('prototypes/help-desk/blueprint.json')).name).toBe('Another desk');
  });

  it('refuses a symlinked src/generated/screens on --force and deletes nothing outside', async () => {
    const file = writeBlueprint();
    expect((await generate('help-desk', '--blueprint', file, '--no-install')).code).toBe(0);
    const outside = mkdtempSync(join(tmpdir(), 'protoyard-outside-'));
    try {
      // A legacy screens folder (retired by the shared shell) replaced by a link outside.
      const screens = join(ws.root, 'prototypes/help-desk/src/generated/screens');
      writeFileSync(
        join(outside, 'SupportTicketPage.svelte'),
        withHeader('<p>legacy wrapper</p>\n', 'svelte')
      );
      writeFileSync(join(outside, 'notes.txt'), 'keep me\n');
      rmSync(screens, { recursive: true, force: true });
      symlinkSync(outside, screens, 'dir');
      const before = readdirSync(outside).sort();

      const forced = await generate(
        'help-desk',
        '--blueprint',
        writeBlueprint(blueprintInput({ name: 'Another desk' }), 'other.json'),
        '--force',
        '--no-install'
      );
      expect(forced.code).not.toBe(0);
      expect(forced.json<Envelope>().error?.code).toBe('unsafe_path');
      expect(readdirSync(outside).sort()).toEqual(before);
      expect(readFileSync(join(outside, 'notes.txt'), 'utf8')).toBe('keep me\n');
      // Refused before any write: the prototype still reflects the first blueprint.
      expect(JSON.parse(read('prototypes/help-desk/blueprint.json')).name).toBe(
        'Help <desk> & "co"'
      );
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('never writes generated files through a symlinked src/generated', async () => {
    const file = writeBlueprint();
    expect((await generate('help-desk', '--blueprint', file, '--no-install')).code).toBe(0);
    const outside = mkdtempSync(join(tmpdir(), 'protoyard-outside-'));
    try {
      const generated = join(ws.root, 'prototypes/help-desk/src/generated');
      rmSync(generated, { recursive: true });
      symlinkSync(outside, generated, 'dir');
      for (const flags of [[], ['--force']]) {
        const run = await generate('help-desk', '--blueprint', file, '--no-install', ...flags);
        expect(run.code).not.toBe(0);
        expect(run.json<Envelope>().error?.code).toBe('unsafe_path');
        expect(readdirSync(outside)).toEqual([]);
      }
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('never writes over a prototype it did not generate', async () => {
    ws.write('prototypes/help-desk/protoyard.json', { id: 'example.other' });
    const run = await generate('help-desk', '--blueprint', writeBlueprint(), '--no-install');
    expect(run.code).toBe(1);
    expect(read('prototypes/help-desk/protoyard.json')).toContain('example.other');
  });

  it('produces a prototype that `protoyard validate` accepts', async () => {
    expect(
      (await generate('help-desk', '--blueprint', writeBlueprint(), '--no-install')).code
    ).toBe(0);
    linkInstalled(ws, 'help-desk');
    // With dependencies resolvable, re-running generate refreshes the spec docs too.
    const refresh = await generate('help-desk', '--blueprint', writeBlueprint());
    expect(refresh.json<Envelope>().data).toMatchObject({ unchanged: true, spec: { ok: true } });
    const run = await cli(['--root', ws.root, '--json', 'validate', 'help-desk']);
    const { ok, data } = run.json<{
      ok: boolean;
      data: { checks: { id: string; status: string; details: string[] }[] };
    }>();
    const failed = data.checks.filter((c) => c.status === 'fail');
    expect(failed).toEqual([]);
    expect(ok).toBe(true);
    expect(data.checks.find((c) => c.id === 'typecheck')?.status).toBe('pass');
    expect(data.checks.find((c) => c.id === 'database-versions')?.status).toBe('pass');
    expect(data.checks.find((c) => c.id === 'blueprint')?.status).toBe('pass');
  }, 120_000);

  it('regenerates after an added field: appends schema v2, keeps owned files and passes validate', async () => {
    expect(
      (await generate('help-desk', '--blueprint', writeBlueprint(), '--no-install')).code
    ).toBe(0);
    linkInstalled(ws, 'help-desk');
    // A person customizes owned files; regeneration must leave them alone.
    const app = join(ws.root, 'prototypes/help-desk/src/App.svelte');
    writeFileSync(app, `${readFileSync(app, 'utf8')}<!-- my change -->\n`);
    const appBefore = readFileSync(app, 'utf8');

    const next = blueprintInput();
    const customer = next.entities[0];
    if (!customer) throw new Error('fixture has no customer entity');
    (customer.fields as unknown[]).push({ name: 'vip', kind: 'boolean', default: false });
    const run = await generate('help-desk', '--blueprint', writeBlueprint(next, 'v2.json'));
    expect(run.code).toBe(0);
    const { data } = run.json<{
      data: Record<string, unknown> & { files: { path: string; status: string }[] };
    }>();
    expect(data).toMatchObject({ regenerated: true, schemaVersion: { from: 1, to: 2, ops: 1 } });
    const status = Object.fromEntries(data.files.map((f) => [f.path, f.status]));
    expect(status).toMatchObject({
      'blueprint.json': 'changed',
      'src/generated/blueprint.snapshot.json': 'changed',
      'src/generated/schema.ts': 'unchanged',
      'src/App.svelte': 'skipped',
      'README.md': 'skipped',
    });
    expect(readFileSync(app, 'utf8')).toBe(appBefore);

    const saved = JSON.parse(read('prototypes/help-desk/blueprint.json'));
    expect(saved.history).toEqual([{ schemaVersion: 1, blueprint: blueprintInput() }]);
    expect(JSON.parse(read('prototypes/help-desk/protoyard.json')).storage.schemaVersion).toBe(2);
    expect(JSON.parse(read('prototypes/help-desk/src/generated/blueprint.snapshot.json'))).toEqual({
      schemaVersion: 2,
      blueprint: next,
      codegenFormat: 2,
    });

    const validate = await cli([
      '--root',
      ws.root,
      '--json',
      'validate',
      'help-desk',
      '--skip-typecheck',
    ]);
    const checks = validate.json<{
      data: { checks: { id: string; status: string; details: string[] }[] };
    }>().data.checks;
    expect(checks.filter((c) => c.status === 'fail')).toEqual([]);
    expect(checks.find((c) => c.id === 'database-versions')?.details).toEqual(['v1, v2']);
    expect(checks.find((c) => c.id === 'blueprint')?.status).toBe('pass');
  }, 120_000);

  it('supports editing blueprint.json in place, entity add/remove, --allow-drop and --dry-run', async () => {
    expect(
      (await generate('help-desk', '--blueprint', writeBlueprint(), '--no-install')).code
    ).toBe(0);
    const inPlace = join(ws.root, 'prototypes/help-desk/blueprint.json');
    const withNote = { ...blueprintInput() } as ReturnType<typeof blueprintInput>;
    withNote.entities = [
      ...withNote.entities,
      {
        name: 'note',
        plural: 'notes',
        fields: [{ name: 'body', kind: 'text' }],
        titleField: 'body',
      } as never,
    ];
    writeFileSync(inPlace, `${JSON.stringify(withNote, null, 2)}\n`);

    const dry = await generate('help-desk', '--blueprint', inPlace, '--dry-run', '--no-install');
    expect(dry.json<Envelope>().data).toMatchObject({
      dryRun: true,
      schemaVersion: { from: 1, to: 2 },
    });
    expect(read('prototypes/help-desk/src/generated/blueprint.snapshot.json')).not.toContain(
      '"notes"'
    );

    const added = await generate('help-desk', '--blueprint', inPlace, '--no-install');
    expect(added.code).toBe(0);
    // The new entity's storage is generated; its routes come from the app model at runtime.
    expect(read('prototypes/help-desk/src/generated/blueprint.snapshot.json')).toContain('"notes"');
    const savedWithNote = parseBlueprint(JSON.parse(read('prototypes/help-desk/blueprint.json')));
    expect(deriveAppModel(savedWithNote).routes.map((route) => route.path)).toContain('/notes');
    expect(existsSync(join(ws.root, 'prototypes/help-desk/src/generated/screens'))).toBe(false);

    // Removing the entity drops a table: refused (exit 4) unless --allow-drop.
    const refused = await generate('help-desk', '--blueprint', writeBlueprint(), '--no-install');
    expect(refused.code).toBe(4);
    expect(refused.json<Envelope>().error?.message).toContain('Regeneration would lose data');
    const dropped = await generate(
      'help-desk',
      '--blueprint',
      writeBlueprint(),
      '--allow-drop',
      '--no-install'
    );
    expect(dropped.code).toBe(0);
    expect(dropped.json<Envelope>().data).toMatchObject({ schemaVersion: { from: 2, to: 3 } });
    const savedWithoutNote = parseBlueprint(
      JSON.parse(read('prototypes/help-desk/blueprint.json'))
    );
    expect(deriveAppModel(savedWithoutNote).routes.map((route) => route.path)).not.toContain(
      '/notes'
    );
    const history = JSON.parse(read('prototypes/help-desk/blueprint.json')).history;
    expect(history.map((h: { schemaVersion: number }) => h.schemaVersion)).toEqual([1, 2]);
    expect(history[1].migrateNext).toEqual({ allowDrop: true });
  });

  it('writes files Biome leaves unchanged, so lint --write never breaks the hashes', async () => {
    const withQuotes = blueprintInput({ name: 'Help desk\'s "VIP" queue' });
    const file = writeBlueprint(withQuotes);
    expect((await generate('help-desk', '--blueprint', file, '--no-install')).code).toBe(0);
    const paths = [
      'prototypes/help-desk/blueprint.json',
      'prototypes/help-desk/protoyard.json',
      'prototypes/help-desk/src/generated',
    ];
    const first = biomeFormatCheck(ws, paths);
    expect(first.output).toMatch(/Checked [1-9]\d* files/);
    expect(first.code, first.output).toBe(0);

    // After a storage change too (history entries, schema version bump).
    const next = blueprintInput({ name: 'Help desk\'s "VIP" queue' });
    const customer = next.entities[0];
    if (!customer) throw new Error('fixture has no customer entity');
    (customer.fields as unknown[]).push({ name: 'tier', kind: 'enum', values: ['a', 'b'] });
    expect((await generate('help-desk', '--blueprint', writeBlueprint(next, 'v2.json'))).code).toBe(
      0
    );
    const second = biomeFormatCheck(ws, paths);
    expect(second.code, second.output).toBe(0);
  });

  it('generates a 10-entity blueprint in under 2 seconds (excluding pnpm install)', async () => {
    const entities = Array.from({ length: 10 }, (_, i) => ({
      name: `thing-${i}`,
      plural: `things-${i}`,
      fields: [
        { name: 'title', kind: 'text', required: true },
        { name: 'status', kind: 'enum', values: ['a', 'b'] },
        ...(i > 0 ? [{ name: 'parent', kind: 'relation', to: `thing-${i - 1}` }] : []),
      ],
      titleField: 'title',
    }));
    const file = writeBlueprint(blueprintInput({ entities }), 'ten.json');
    const run = await generate('ten-things', '--blueprint', file, '--no-install');
    expect(run.code).toBe(0);
    const { data } = run.json<Envelope>();
    console.info(`generate: 10 entities in ${data.durationMs} ms`);
    expect(data.durationMs as number).toBeLessThan(2_000);
    // Ten entities, the same data modules: routes and screens come from the app model at runtime.
    const generated = data.generated as string[];
    expect(generated).toEqual(
      expect.arrayContaining([
        'src/generated/blueprint.ts',
        'src/generated/schema.ts',
        'src/generated/policy.ts',
        'src/generated/services.ts',
        'src/generated/scenarios.ts',
      ])
    );
    expect(generated.filter((path) => /\/screens\/|\/(routes|layout)\.ts$/.test(path))).toEqual([]);
    expect(deriveAppModel(parseBlueprint(blueprintInput({ entities }))).routes).toHaveLength(22);
  });
});

describe('codegen emitters', () => {
  const blueprint = parseBlueprint(blueprintInput());

  it('are pure and stable (snapshot)', () => {
    const files = emitPrototype(
      blueprint,
      'help-desk',
      `${JSON.stringify(blueprintInput(), null, 2)}\n`
    );
    expect(
      emitPrototype(blueprint, 'help-desk', `${JSON.stringify(blueprintInput(), null, 2)}\n`)
    ).toEqual(files);
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
    expect(byPath['src/App.svelte']).toMatchSnapshot();
    expect(byPath['src/generated/schema.ts']).toMatchSnapshot();
    expect(byPath['tests/services.test.ts']).toMatchSnapshot();
  });

  it('only reaches code through escaped string literals', () => {
    // Blueprint values reach code only as data: the screen title stays in blueprint.json
    // and is never pasted into a .ts or .svelte file.
    const files = emitPrototype(blueprint, 'x', '{}');
    for (const file of files.filter((f) => /\.(ts|svelte)$/.test(f.path))) {
      expect(file.content, file.path).not.toContain("</script>'");
      expect(file.content, file.path).not.toContain('Tickets "VIP"');
    }
    expect(deriveAppModel(blueprint).routes.map((route) => route.title)).toContain(
      'Tickets "VIP" </script>'
    );
    // A quote in a value is escaped, never closing the literal.
    expect(tsString("it's")).toBe('"it\'s"');
    expect(tsString(`a'b"c\\`)).toBe(`'a\\'b"c\\\\'`);
  });

  it('quotes a __proto__ key and keeps the README title on one line', () => {
    const literal = formatTs(JSON.parse('{"__proto__": {"x": 1}, "plain": 2}'));
    expect(literal).toContain("'__proto__': {");
    expect(literal).toContain('plain: 2');
    const named = parseBlueprint({ ...blueprintInput(), name: 'Help\n# Injected\r\n- line' });
    const readme = emitPrototype(named, 'x', '{}').find((f) => f.path === 'README.md');
    expect(readme?.content.split('\n')[0]).toBe('# Help # Injected - line');
    expect(readme?.content).not.toMatch(/^# Injected/m);
  });

  it('routes a declared dashboard through the app model and its lazy kit, emitting no screen', () => {
    const dashboardBlueprint = parseBlueprint({
      ...blueprintInput(),
      screens: [
        {
          type: 'dashboard',
          title: 'Sales overview',
          widgets: [{ kind: 'kpi', label: 'Deals', entity: 'support-ticket', aggregate: 'count' }],
        },
      ],
    });
    const files = emitPrototype(dashboardBlueprint, 'help-desk', '{}');
    expect(files.filter((file) => file.path.includes('/screens/'))).toEqual([]);

    const model = deriveAppModel(dashboardBlueprint);
    expect(model.routes.find((route) => route.path === '/dashboard')).toMatchObject({
      view: 'screen',
      screenType: 'dashboard',
      screenIndex: 0,
      component: 'Dashboard1Screen',
      title: 'Sales overview',
    });
    expect(model.nav.find((item) => item.path === '/dashboard')?.label).toBe('Sales overview');
    // The shell loads the dashboard kit lazily from its own entry.
    expect(getScreenKindMetadata('dashboard')).toMatchObject({
      subpath: '@protoyard/crud/screens/dashboard',
      exportName: 'DashboardScreen',
    });
  });

  it('formats JSON like Biome: short primitive arrays inline, objects expanded', () => {
    expect(formatJson({ a: [1, 'x', null], b: {}, c: [], d: [{ e: true }] })).toBe(
      '{\n  "a": [1, "x", null],\n  "b": {},\n  "c": [],\n  "d": [\n    {\n      "e": true\n    }\n  ]\n}\n'
    );
    const long = Array.from({ length: 30 }, (_, i) => `value-${i}`);
    expect(formatJson({ long }).split('\n')).toHaveLength(30 + 5);
  });

  it('detects edited generated files from the header hash', () => {
    const text = withHeader('export const a = 1;\n', 'ts');
    expect(checkHeader(text)).toEqual({ generated: true, intact: true });
    expect(checkHeader(text.replace('a = 1', 'a = 2'))).toEqual({ generated: true, intact: false });
    expect(checkHeader(withHeader('<p>x</p>\n', 'svelte')).intact).toBe(true);
    expect(checkHeader('export {};\n')).toEqual({ generated: false, intact: false });
  });

  it('HTML-escapes the personalized title and description', () => {
    const html = '<meta name="description" content="old" /><title>Old</title>';
    expect(personalizeHtml(html, '<b>"x"</b>', "a & b's")).toBe(
      '<meta name="description" content="a &amp; b&#39;s" /><title>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</title>'
    );
  });
});
