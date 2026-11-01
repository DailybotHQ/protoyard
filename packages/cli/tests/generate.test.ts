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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitPrototype, personalizeHtml } from '../src/lib/codegen/emit.ts';
import { formatTs, tsString } from '../src/lib/codegen/format.ts';
import { checkHeader, withHeader } from '../src/lib/codegen/header.ts';
import {
  addCrudTemplate,
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
});

describe('codegen emitters', () => {
  const blueprint = parseBlueprint(blueprintInput());

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

  it('HTML-escapes the personalized title and description', () => {
    const html = '<meta name="description" content="old" /><title>Old</title>';
    expect(personalizeHtml(html, '<b>"x"</b>', "a & b's")).toBe(
      '<meta name="description" content="a &amp; b&#39;s" /><title>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</title>'
    );
  });
});
