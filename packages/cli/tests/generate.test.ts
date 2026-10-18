// @vitest-environment node
import { cpSync, existsSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBlueprint } from '@protoyard/blueprint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emitPrototype, personalizeHtml } from '../src/lib/codegen/emit.ts';
import { checkHeader, withHeader } from '../src/lib/codegen/header.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const TEMPLATE = join(REPO, 'templates/crud-app');

let ws: TempWorkspace;
beforeEach(() => {
  ws = createWorkspace();
  // The real base template, without installs or build output.
  cpSync(TEMPLATE, join(ws.root, 'templates/crud-app'), {
    recursive: true,
    filter: (src) => !/[/\\](node_modules|dist)([/\\]|$)/.test(src),
  });
});
afterEach(() => ws.cleanup());

const read = (path: string) => readFileSync(join(ws.root, path), 'utf8');

function blueprintInput(overrides: Record<string, unknown> = {}) {
  return {
    formatVersion: 1,
    name: 'Help <desk> & "co"',
    description: "Customers and tickets: it's fictional.",
    entities: [
      {
        name: 'customer',
        plural: 'customers',
        fields: [
          { name: 'name', kind: 'text', required: true, minLength: 2 },
          { name: 'manager', kind: 'persona' },
        ],
        titleField: 'name',
        ownerField: 'manager',
      },
      {
        name: 'support-ticket',
        plural: 'support-tickets',
        label: 'Tickets "VIP" </script>',
        fields: [
          { name: 'subject', kind: 'text', required: true },
          {
            name: 'status',
            kind: 'enum',
            values: ['open', 'solved'],
            default: 'open',
            required: true,
          },
          {
            name: 'customer',
            kind: 'relation',
            to: 'customer',
            required: true,
            onDelete: 'cascade',
          },
        ],
        titleField: 'subject',
      },
    ],
    roles: [
      { name: 'owner', permissions: { '*': ['*'] } },
      { name: 'admin', permissions: { '*': ['*'] } },
      { name: 'member', permissions: { '*': ['read', 'create', 'update'] } },
      { name: 'viewer', permissions: { '*': ['read'] } },
    ],
    ...overrides,
  };
}

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
        'src/generated/routes.ts',
        'src/generated/screens/SupportTicketPage.svelte',
        'src/App.svelte',
        'tests/services.test.ts',
        'protoyard.json',
      ])
    );
    expect(paths).not.toContain('src/screens/ProjectsPage.svelte');
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

  it('generates a prototype with hash-headed modules, a derived manifest and lazy routes', async () => {
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
    expect(read('prototypes/help-desk/src/generated/routes.ts')).toContain(
      "load: () => import('./screens/SupportTicketPage.svelte')"
    );
    const html = read('prototypes/help-desk/index.html');
    expect(html).toContain('<title>Help &lt;desk&gt; &amp; &quot;co&quot;</title>');
    expect(html).toContain('content="Customers and tickets: it&#39;s fictional."');
    // No notifications feature in this blueprint: the bell (and its table) is not wired.
    expect(read('prototypes/help-desk/src/App.svelte')).not.toContain('NotificationsBell');
  });

  it('is idempotent for the same blueprint and refuses to overwrite a different one', async () => {
    const file = writeBlueprint();
    expect((await generate('help-desk', '--blueprint', file, '--no-install')).code).toBe(0);
    const routes = join(ws.root, 'prototypes/help-desk/src/generated/routes.ts');
    const before = statSync(routes).mtimeMs;

    const again = await generate('help-desk', '--blueprint', file, '--no-install');
    expect(again.code).toBe(0);
    expect(again.json<Envelope>().data).toMatchObject({ created: false, unchanged: true });
    expect(statSync(routes).mtimeMs).toBe(before);

    const changed = await generate(
      'help-desk',
      '--blueprint',
      writeBlueprint(blueprintInput({ name: 'Another desk' }), 'other.json'),
      '--no-install'
    );
    expect(changed.code).toBe(1);
    expect(changed.json<Envelope>().error?.code).toBe('conflict');

    writeFileSync(routes, `${readFileSync(routes, 'utf8')}// edited\n`);
    expect(checkHeader(readFileSync(routes, 'utf8')).intact).toBe(false);
    expect((await generate('help-desk', '--blueprint', file, '--no-install')).code).toBe(1);
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
    // Link installed dependencies instead of running pnpm install: the template's for the
    // prototype, the repository's for the workspace root (tsx, svelte-check).
    symlinkSync(join(REPO, 'node_modules'), join(ws.root, 'node_modules'), 'dir');
    cpSync(join(REPO, 'tsconfig.base.json'), join(ws.root, 'tsconfig.base.json'));
    cpSync(join(REPO, 'tests/support'), join(ws.root, 'tests/support'), { recursive: true });
    symlinkSync(
      join(TEMPLATE, 'node_modules'),
      join(ws.root, 'prototypes/help-desk/node_modules'),
      'dir'
    );
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
  }, 120_000);

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
    expect(
      (data.generated as string[]).filter((p) => p.startsWith('src/generated/screens/'))
    ).toHaveLength(10);
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
    expect(byPath['src/generated/routes.ts']).toMatchSnapshot();
    expect(byPath['src/generated/screens/SupportTicketPage.svelte']).toMatchSnapshot();
    expect(byPath['tests/services.test.ts']).toMatchSnapshot();
  });

  it('only reaches code through JSON string literals', () => {
    const routes = emitPrototype(blueprint, 'x', '{}').find(
      (f) => f.path === 'src/generated/routes.ts'
    );
    expect(routes?.content).toContain('title: "Tickets \\"VIP\\" </script>"');
    expect(routes?.content).not.toContain('title: "Tickets "VIP"');
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
