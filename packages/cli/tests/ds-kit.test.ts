// @vitest-environment node
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scanPrototypeDesignSystem } from '../src/lib/ds-check/index.ts';
import { biomeCheck, cli, createWorkspace, manifest, type TempWorkspace } from './helpers.ts';

vi.setConfig({ testTimeout: 120_000 });

/**
 * PLAN_013 T-kit: `protoyard ds kit <id>` writes the kit prototype of any
 * design system (`prototypes/<id>-kit`): Texuli's DesignSystemKit fed from
 * data, bound to the design system, listed in the registry, the same bytes
 * on every rerun, and the changes since the last release.
 */

type Envelope<T = Record<string, unknown>> = {
  ok: boolean;
  data: T;
  error?: { code: string; message: string; hint?: string };
};

interface KitResult {
  created: boolean;
  slug: string;
  written: string[];
  previous: string | null;
  previews: string[];
  stories: string[];
  indexed: boolean;
  binding: { id: string; version: string; locked: boolean };
  designSystemCheck: { ok: boolean; violations: number };
  stale?: string[];
  upToDate?: boolean;
}

/** The shape of the blank template's definition, as the other ds tests use. */
const PROTOTYPE = `import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
});
`;

let ws: TempWorkspace | undefined;
afterEach(() => {
  ws?.cleanup();
  ws = undefined;
});

const root = () => (ws as TempWorkspace).root;
const run = (...args: string[]) => cli(['--root', root(), '--json', ...args]);
const read = (rel: string) => readFileSync(join(root(), rel), 'utf8');
const json = (rel: string) => JSON.parse(read(rel)) as Record<string, unknown>;

function setup() {
  ws = createWorkspace();
  const base = 'templates/blank';
  ws.write(
    `${base}/protoyard.json`,
    manifest({ id: 'template.blank', slug: 'blank', kind: 'template', name: 'Blank' })
  );
  ws.write(`${base}/package.json`, {
    name: '@protoyard-template/blank',
    private: true,
    dependencies: { '@protoyard/runtime': 'workspace:*' },
  });
  ws.write(`${base}/README.md`, '# Blank\n');
  ws.write(`${base}/index.html`, '<!doctype html><title>Blank</title>\n');
  ws.write(`${base}/src/prototype.ts`, PROTOTYPE);
  ws.write(`${base}/src/App.svelte`, '<p>Notes</p>\n');
  ws.write(`${base}/src/screens/NotesList.svelte`, '<p>Notes list</p>\n');
  ws.write(`${base}/src/main.ts`, "import './app.css';\n");
  ws.write(`${base}/src/app.css`, '@source "./";\n');
}

async function designSystem(id: string, brand = '#0f766e') {
  const created = await run('ds', 'new', id, '--brand', brand, '--allow', 'minimal');
  expect(created.code, created.stdout).toBe(0);
}

/** Every file of a prototype with its bytes. */
function snapshot(slug: string): Record<string, string> {
  const dir = join(root(), 'prototypes', slug);
  const out: Record<string, string> = {};
  const walk = (abs: string) => {
    for (const name of readdirSync(abs).sort()) {
      const child = join(abs, name);
      if (statSync(child).isDirectory()) walk(child);
      else out[relative(dir, child)] = readFileSync(child, 'utf8');
    }
  };
  walk(dir);
  return out;
}

describe('protoyard ds kit (PLAN_013 T-kit)', () => {
  it('writes a bound kit prototype from data, with the library and its stories, listed in the registry', async () => {
    setup();
    await designSystem('harbor');
    const component = (...args: string[]) => run('ds', 'component', ...args);
    expect(
      (
        await component(
          'request',
          'harbor',
          'StatusPill',
          '--purpose',
          'Shows a status with its label',
          '--why',
          'Badge has no label layout',
          '--by',
          'Ada Example'
        )
      ).code
    ).toBe(0);
    expect((await component('approve-request', 'harbor', 'StatusPill', '--by', 'Bo')).code).toBe(0);
    const scaffolded = await component('new', 'harbor', 'StatusPill');
    expect(scaffolded.code, scaffolded.stdout).toBe(0);

    const result = await run('ds', 'kit', 'harbor', '--no-install');
    expect(result.code, result.stdout).toBe(0);
    const data = result.json<Envelope<KitResult>>().data;
    expect(data).toMatchObject({
      created: true,
      slug: 'harbor-kit',
      previous: null,
      previews: ['status-pill'],
      stories: ['status-pill'],
      indexed: true,
      binding: { id: 'harbor', version: '1.0.0', locked: false },
      designSystemCheck: { ok: true, violations: 0 },
    });

    const kit = json('prototypes/harbor-kit/src/kit/kit.json') as {
      designSystem: string;
      document: Record<string, unknown>;
      compiled: Record<string, unknown>;
      allow: { allow: Record<string, unknown> };
      catalog: { components: { id: string }[] };
      stories: Record<string, { name: string; props: Record<string, unknown> }[]>;
      previous?: unknown;
    };
    expect(kit.designSystem).toBe('harbor');
    expect(kit.document).toEqual(json('design-systems/harbor/document.json'));
    expect(kit.compiled).toMatchObject({ id: 'harbor', version: '1.0.0' });
    expect(Object.keys(kit.compiled)).toEqual(
      expect.arrayContaining(['modes', 'vars', 'report', 'accessibility'])
    );
    expect(Object.keys(kit.allow.allow)).toEqual(
      Object.keys(json('design-systems/harbor/document.json').allow as object)
    );
    // Texuli's merged catalog: its own components and the catalog extensions.
    expect(kit.catalog.components.some((c) => c.id === 'button')).toBe(true);
    expect(kit.catalog.components.some((c) => c.id.startsWith('protoyard:'))).toBe(true);
    expect(kit.stories['status-pill']?.[0]?.name).toBe('Default');
    expect(kit.previous).toBeUndefined();

    expect(read('prototypes/harbor-kit/src/kit/library.ts')).toContain(
      "import StatusPill from '@ds/harbor/StatusPill';"
    );
    expect(read('prototypes/harbor-kit/src/screens/KitPage.svelte')).toContain(
      "import { DesignSystemKit, type KitLibrarySnippet } from 'texuli/ds-kit';"
    );
    // Each story figure is keyed by its position, so a repeated name never breaks the page.
    expect(read('prototypes/harbor-kit/src/screens/KitPage.svelte')).toContain(
      'as story, index (index)}'
    );
    const prototype = read('prototypes/harbor-kit/src/prototype.ts');
    expect(prototype).toContain("import { designSystemTheme } from './design-system.ts';");
    expect(prototype).toContain('themes: [designSystemTheme]');
    expect(read('prototypes/harbor-kit/src/design-system.ts')).toContain('"id": "harbor"');

    // The template's own screens are gone; its entry and styles stay.
    expect(existsSync(join(root(), 'prototypes/harbor-kit/src/screens/NotesList.svelte'))).toBe(
      false
    );
    expect(read('prototypes/harbor-kit/src/main.ts')).toBe("import './app.css';\n");

    const written = json('prototypes/harbor-kit/protoyard.json');
    expect(written).toMatchObject({
      slug: 'harbor-kit',
      name: 'Brand kit',
      template: 'blank',
      defaultTheme: 'harbor',
      designSystem: { id: 'harbor', version: '1.0.0', locked: false },
      scenarios: ['review'],
      defaultScenario: 'review',
      category: 'design-system',
    });

    // Bound and clean: the check ds scan finds nothing.
    expect(
      scanPrototypeDesignSystem(root(), join(root(), 'prototypes/harbor-kit'), {
        designSystemId: 'harbor',
      }).violations
    ).toEqual([]);

    // The gallery's registry lists it (the gallery links `<id>-kit`).
    const list = await run('ds', 'list');
    const listed =
      list.json<
        Envelope<{ designSystems: { id: string; boundPrototypes: { slug: string }[] }[] }>
      >().data;
    expect(listed.designSystems[0]?.boundPrototypes.map((p) => p.slug)).toEqual(['harbor-kit']);
  });

  it('is idempotent: a rerun writes nothing and keeps every byte', async () => {
    setup();
    await designSystem('harbor');
    expect((await run('ds', 'kit', 'harbor', '--no-install')).code).toBe(0);
    const before = snapshot('harbor-kit');
    const again = await run('ds', 'kit', 'harbor', '--no-install');
    expect(again.code, again.stdout).toBe(0);
    expect(again.json<Envelope<KitResult>>().data).toMatchObject({ created: false, written: [] });
    expect(snapshot('harbor-kit')).toEqual(before);

    const check = await run('ds', 'kit', 'harbor', '--check');
    expect(check.code, check.stdout).toBe(0);
    expect(check.json<Envelope<KitResult>>().data).toMatchObject({ upToDate: true, stale: [] });
  });

  it('shows the changes since the previous release and --check catches a stale kit', async () => {
    setup();
    await designSystem('harbor');
    expect((await run('ds', 'approve', 'harbor', '--by', 'Ada', '--release', '1.0.0')).code).toBe(
      0
    );
    expect((await run('ds', 'kit', 'harbor', '--no-install')).code).toBe(0);
    expect(json('prototypes/harbor-kit/src/kit/kit.json').previous).toBeUndefined();

    const doc = json('design-systems/harbor/document.json');
    doc.color = { brand: { seed: '#7c3aed' } };
    writeFileSync(
      join(root(), 'design-systems/harbor/document.json'),
      `${JSON.stringify(doc, null, 2)}\n`
    );
    expect((await run('ds', 'approve', 'harbor', '--by', 'Bo', '--release', '1.1.0')).code).toBe(0);

    const stale = await run('ds', 'kit', 'harbor', '--check');
    expect(stale.code).not.toBe(0);
    const staleData = stale.json<Envelope<KitResult>>();
    expect(staleData.ok).toBe(false);
    expect(staleData.data.stale).toEqual(expect.arrayContaining(['src/kit/kit.json']));

    const dry = await run('ds', 'kit', 'harbor', '--dry-run');
    expect(dry.code).toBe(0);
    const unchanged = read('prototypes/harbor-kit/src/kit/kit.json');

    const refreshed = await run('ds', 'kit', 'harbor', '--no-install');
    expect(refreshed.code, refreshed.stdout).toBe(0);
    expect(unchanged).not.toBe(read('prototypes/harbor-kit/src/kit/kit.json'));
    const data = refreshed.json<Envelope<KitResult>>().data;
    expect(data).toMatchObject({
      created: false,
      previous: '1.0.0',
      binding: { id: 'harbor', version: '1.1.0', locked: false },
    });
    expect(data.written).toContain('src/kit/kit.json');
    const kit = json('prototypes/harbor-kit/src/kit/kit.json') as {
      previous: {
        release: string;
        document: Record<string, unknown>;
        compiled: { version: string };
      };
    };
    expect(kit.previous.release).toBe('1.0.0');
    expect(kit.previous.document).toEqual(
      json('design-systems/harbor/releases/1.0.0.json').document
    );
    expect(kit.previous.compiled.version).toBe('1.0.0');
    expect(json('prototypes/harbor-kit/protoyard.json').designSystem).toEqual({
      id: 'harbor',
      version: '1.1.0',
      locked: false,
    });

    // What the kit and the release write is already in the repository's Biome style.
    const kitFiles = [
      'protoyard.json',
      'index.html',
      'src/App.svelte',
      'src/screens/KitPage.svelte',
      'src/kit/kit.json',
      'src/kit/library.ts',
      'src/kit/model.ts',
      'src/prototype.ts',
      'src/database/schema.ts',
      'src/scenarios/index.ts',
      'src/scenarios/generators.ts',
      'tests/kit.test.ts',
    ].map((file) => `prototypes/harbor-kit/${file}`);
    const biome = biomeCheck(ws as TempWorkspace, [
      ...kitFiles,
      'design-systems/harbor/releases/1.0.0.json',
      'design-systems/harbor/releases/1.1.0.json',
    ]);
    expect(biome.code, biome.output).toBe(0);
  });

  it('is generic, honors --slug and refuses a folder that is not the kit', async () => {
    setup();
    await designSystem('dusk', '#7c3aed');
    const custom = await run('ds', 'kit', 'dusk', '--slug', 'dusk-review', '--no-install');
    expect(custom.code, custom.stdout).toBe(0);
    expect(json('prototypes/dusk-review/src/kit/kit.json').designSystem).toBe('dusk');

    await designSystem('harbor');
    const other = await run('ds', 'kit', 'harbor', '--slug', 'dusk-review');
    expect(other.code).not.toBe(0);
    expect(other.json<Envelope>().error).toMatchObject({ code: 'conflict' });

    const missing = await run('ds', 'kit', 'nowhere');
    expect(missing.json<Envelope>().error?.code).toBe('not_found');
    const check = await run('ds', 'kit', 'harbor', '--check');
    expect(check.json<Envelope<KitResult>>().ok).toBe(false);
    expect(existsSync(join(root(), 'prototypes/harbor-kit'))).toBe(false);
  });

  it('refuses a symlinked kit folder or a symlinked folder inside it, before writing anything (F4)', async () => {
    setup();
    await designSystem('acme');
    const created = await run('ds', 'kit', 'acme', '--no-install');
    expect(created.code, created.stdout).toBe(0);
    const kit = join(root(), 'prototypes/acme-kit');
    const outside = mkdtempSync(join(tmpdir(), 'protoyard-kit-outside-'));
    try {
      // A linked src/screens/: the kit page would land outside the workspace.
      const screens = join(kit, 'src/screens');
      expect(readdirSync(screens).length).toBeGreaterThan(0);
      rmSync(screens, { recursive: true });
      symlinkSync(outside, screens, 'dir');
      const linked = await run('ds', 'kit', 'acme');
      expect(linked.code).not.toBe(0);
      expect(linked.json<Envelope>().error).toMatchObject({ code: 'unsafe_path' });
      expect(linked.json<Envelope>().error?.message).toContain('prototypes/acme-kit/src/screens');
      expect(readdirSync(outside)).toEqual([]);

      // The kit folder itself linked from elsewhere.
      rmSync(screens);
      const moved = join(outside, 'acme-kit');
      renameSync(kit, moved);
      symlinkSync(moved, kit, 'dir');
      const before = readFileSync(join(moved, 'protoyard.json'), 'utf8');
      const whole = await run('ds', 'kit', 'acme');
      expect(whole.code).not.toBe(0);
      expect(whole.json<Envelope>().error).toMatchObject({ code: 'unsafe_path' });
      expect(readFileSync(join(moved, 'protoyard.json'), 'utf8')).toBe(before);
      expect(existsSync(join(moved, 'src/screens'))).toBe(false);
    } finally {
      rmSync(kit, { force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
