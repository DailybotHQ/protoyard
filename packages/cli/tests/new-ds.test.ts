// @vitest-environment node
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lockedBindingProblem } from '../src/commands/validate.ts';
import { GENERATED_MARKER } from '../src/lib/codegen/header.ts';
import { checkBlueprintDrift } from '../src/lib/codegen/regenerate.ts';
import { scanPrototypeDesignSystem } from '../src/lib/ds-check/index.ts';
import { cliArgs, createMcpToolHandler } from '../src/mcp/tools.ts';
import {
  addCrudTemplate,
  cli,
  createWorkspace,
  helpdeskBlueprint,
  manifest,
  type TempWorkspace,
} from './helpers.ts';

vi.setConfig({ testTimeout: 60_000 });

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

type Envelope<T = Record<string, unknown>> = {
  ok: boolean;
  data: T;
  error?: { code: string; message: string; hint?: string; data?: Record<string, unknown> };
};

/** A prototype definition `ds use` can wire (the shape of the blank template's). */
const PROTOTYPE = `import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
});
`;

/** Texuli components composed with layout utilities only: passes check ds. */
const CLEAN_APP = `<script lang="ts">
import { Card } from 'texuli/card';
</script>

<div class="grid gap-4 p-3 md:grid-cols-2">
  <Card>Revenue</Card>
  <Card>Churn</Card>
</div>
`;

/** A native control, visual utilities and an inline style: three rules. */
const DIRTY_APP = `<script lang="ts">
let count = $state(0);
</script>

<button class="bg-red-500 text-white" style="color: red" onclick={() => count++}>Add</button>
`;

let ws: TempWorkspace | undefined;
afterEach(() => {
  ws?.cleanup();
  ws = undefined;
});

const root = () => (ws as TempWorkspace).root;
const run = (...args: string[]) => cli(['--root', root(), '--json', ...args]);
const json = (path: string) =>
  JSON.parse(readFileSync(join(root(), path), 'utf8')) as Record<string, unknown>;
const read = (path: string) => readFileSync(join(root(), path), 'utf8');
const write = (path: string, text: string) => writeFileSync(join(root(), path), text);

/** A template in the temp workspace; the real templates are being cleaned in another lane. */
function template(name: string, app: string) {
  const base = `templates/${name}`;
  ws?.write(
    `${base}/protoyard.json`,
    manifest({ id: `template.${name}`, slug: name, kind: 'template', name: `Fixture ${name}` })
  );
  ws?.write(`${base}/package.json`, {
    name: `@protoyard-template/${name}`,
    private: true,
    dependencies: { '@protoyard/runtime': 'workspace:*' },
  });
  ws?.write(`${base}/README.md`, `# Fixture ${name}\n`);
  ws?.write(`${base}/src/prototype.ts`, PROTOTYPE);
  ws?.write(`${base}/src/App.svelte`, app);
  ws?.write(`${base}/src/main.ts`, "import './app.css';\n");
  ws?.write(`${base}/src/app.css`, '.page {\n  display: grid;\n  gap: 1rem;\n}\n');
}

/** Approves through the CLI (Texuli's approveDesignSystem); it cannot prove who approved. */
async function approve(id: string) {
  const approved = await run('ds', 'approve', id, '--by', 'Ada Example');
  expect(approved.code, approved.stdout).toBe(0);
}

async function designSystem(id: string, approved = true) {
  const created = await run('ds', 'new', id, '--brand', '#0f766e');
  expect(created.code, created.stdout).toBe(0);
  if (approved) await approve(id);
  return json(`design-systems/${id}/document.json`).version as string;
}

function setup() {
  ws = createWorkspace();
  template('blank', CLEAN_APP);
  template('clean-kit', CLEAN_APP);
  template('styled', DIRTY_APP);
}

describe('protoyard new --ds (PLAN_013 T-new-ds)', () => {
  it('creates a locked prototype from the blank template by default, bound at the exact version', async () => {
    setup();
    const version = await designSystem('harbor');
    const result = await run('new', 'harbor-app', '--ds', 'harbor', '--no-install');
    expect(result.code, result.stdout).toBe(0);
    const data = result.json<Envelope>().data as Record<string, unknown>;
    expect(data).toMatchObject({
      template: 'blank',
      source: { kind: 'template', slug: 'blank' },
      designSystem: { id: 'harbor', version, locked: true },
      designSystemCheck: { ok: true, violations: 0 },
    });
    expect(data.nextSteps).toContain('pnpm protoyard check ds harbor-app');

    const dir = join(root(), 'prototypes/harbor-app');
    const written = json('prototypes/harbor-app/protoyard.json');
    expect(written.designSystem).toEqual({ id: 'harbor', version, locked: true });
    expect(written.defaultTheme).toBe('harbor');
    expect(written.template).toBe('blank');
    expect(read('prototypes/harbor-app/src/design-system.ts')).toContain('"id": "harbor"');
    expect(read('prototypes/harbor-app/src/prototype.ts')).toContain(
      "import { designSystemTheme } from './design-system.ts';"
    );
    expect(read('prototypes/harbor-app/src/prototype.ts')).toContain('themes: [designSystemTheme]');
    // Nothing visual is copied from the design-system folder.
    expect(existsSync(join(dir, 'document.json'))).toBe(false);
    expect(existsSync(join(dir, 'components'))).toBe(false);

    expect(scanPrototypeDesignSystem(root(), dir, { designSystemId: 'harbor' }).violations).toEqual(
      []
    );
    expect(lockedBindingProblem(root(), dir, { id: 'harbor', version })).toBeNull();
  });

  it('--dry-run runs every check and writes nothing', async () => {
    setup();
    const version = await designSystem('harbor');
    const before = existsSync(join(root(), 'prototypes'))
      ? readdirSync(join(root(), 'prototypes')).sort()
      : [];
    const preview = await run('new', 'dry-app', '--ds', 'harbor', '--dry-run');
    expect(preview.code, preview.stdout).toBe(0);
    const data = preview.json<Envelope>().data as Record<string, unknown>;
    expect(data).toMatchObject({
      dryRun: true,
      created: true,
      template: 'blank',
      designSystem: { id: 'harbor', version, locked: true },
      install: { skipped: true },
    });
    expect(data.files).toBeGreaterThan(0);
    expect(existsSync(join(root(), 'prototypes/dry-app'))).toBe(false);
    const after = existsSync(join(root(), 'prototypes'))
      ? readdirSync(join(root(), 'prototypes')).sort()
      : [];
    expect(after).toEqual(before);
    // The source template is read, never changed.
    expect(existsSync(join(root(), 'templates/blank/src/design-system.ts'))).toBe(false);

    // The same refusals as a real run.
    await designSystem('dusk', false);
    const draft = await run('new', 'dry-draft', '--ds', 'dusk', '--dry-run');
    expect(draft.code).not.toBe(0);
    expect(draft.json<Envelope>().error?.message).toContain('is a draft');
    const plain = await run('new', 'dry-plain', '--template', 'blank', '--dry-run');
    expect(plain.code, plain.stdout).toBe(0);
    expect(plain.json<Envelope>().data).toMatchObject({ dryRun: true, created: true });
    expect(existsSync(join(root(), 'prototypes/dry-plain'))).toBe(false);
  });

  it('uses the named template when it is lock-clean', async () => {
    setup();
    await designSystem('harbor');
    const result = await run(
      'new',
      'kit-app',
      '--ds',
      'harbor',
      '--template',
      'clean-kit',
      '--name',
      'Kit App',
      '--no-install'
    );
    expect(result.code, result.stdout).toBe(0);
    expect(json('prototypes/kit-app/protoyard.json')).toMatchObject({
      template: 'clean-kit',
      name: 'Kit App',
      designSystem: { id: 'harbor', locked: true },
    });
  });

  it('refuses an unknown, a flat and a draft design system before copying anything', async () => {
    setup();
    const unknown = await run('new', 'nope-app', '--ds', 'nope', '--no-install');
    expect(unknown.code).not.toBe(0);
    expect(unknown.json<Envelope>().error?.code).toBe('not_found');

    const flat = await run(
      'ds',
      'new',
      'flat-ds',
      '--brand',
      '#334155',
      '--out',
      'design-systems/flat-ds.json'
    );
    expect(flat.code, flat.stdout).toBe(0);
    const flatRun = await run('new', 'flat-app', '--ds', 'flat-ds', '--no-install');
    expect(flatRun.code).not.toBe(0);
    expect(flatRun.json<Envelope>().error?.message).toContain('ds migrate');

    await designSystem('dusk', false);
    const draft = await run('new', 'draft-app', '--ds', 'dusk', '--no-install');
    expect(draft.code).not.toBe(0);
    expect(draft.json<Envelope>().error?.message).toContain('is a draft');

    // Changed after approval: same version, different content.
    await designSystem('harbor');
    const document = json('design-systems/harbor/document.json');
    ws?.write('design-systems/harbor/document.json', { ...document, description: 'Edited.' });
    const tampered = await run('new', 'tampered-app', '--ds', 'harbor', '--no-install');
    expect(tampered.code).not.toBe(0);
    expect(tampered.json<Envelope>().error?.message).toContain('changed after it was approved');

    for (const slug of ['nope-app', 'flat-app', 'draft-app', 'tampered-app']) {
      expect(existsSync(join(root(), 'prototypes', slug)), slug).toBe(false);
    }
  });

  it('refuses a template that is not lock-clean, with counts by rule', async () => {
    setup();
    await designSystem('harbor');
    const result = await run(
      'new',
      'styled-app',
      '--ds',
      'harbor',
      '--template',
      'styled',
      '--no-install'
    );
    expect(result.code).toBe(4);
    const error = result.json<Envelope>().error;
    expect(error?.code).toBe('validation');
    expect(error?.message).toMatch(/^Template styled is not lock-clean yet: \d+ violations \(/);
    expect(error?.message).toContain('ds-raw-control: 1');
    expect(error?.message).toContain('ds-inline-style: 1');
    expect(error?.message).toContain('create it unlocked with --unlocked');
    const data = result.json<Envelope>().data as unknown as {
      template: string;
      violations: number;
      byRule: Record<string, number>;
    };
    expect(data.template).toBe('styled');
    expect(data.byRule['ds-raw-control']).toBe(1);
    expect(data.byRule['ds-inline-style']).toBe(1);
    expect(data.byRule['ds-utility']).toBeGreaterThan(0);
    expect(data.violations).toBe(Object.values(data.byRule).reduce((a, b) => a + b, 0));
    expect(existsSync(join(root(), 'prototypes/styled-app'))).toBe(false);
  });

  it('runs the allow rules at the template gate and after creation, as check ds does', async () => {
    setup();
    await designSystem('harbor', false);
    // The allow section stops listing the card the template renders.
    const file = join(root(), 'design-systems/harbor/document.json');
    const document = JSON.parse(readFileSync(file, 'utf8'));
    delete document.allow.card;
    writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
    await approve('harbor');

    const gated = await run('new', 'card-app', '--ds', 'harbor', '--no-install');
    expect(gated.code).toBe(4);
    const data = gated.json<Envelope>().data as unknown as { byRule: Record<string, number> };
    expect(data.byRule['ds-not-allowed']).toBe(2);
    expect(existsSync(join(root(), 'prototypes/card-app'))).toBe(false);

    // Unlocked, it is created, and its check reports what check ds reports.
    const made = await run('new', 'card-app', '--ds', 'harbor', '--unlocked', '--no-install');
    expect(made.code, made.stdout).toBe(0);
    const check = (made.json<Envelope>().data as Record<string, unknown>).designSystemCheck as {
      ok: boolean;
      byRule: Record<string, number>;
    };
    expect(check.ok).toBe(false);
    expect(check.byRule['ds-not-allowed']).toBe(2);
    const report = await run('check', 'ds', 'card-app', '--report');
    const violations = report
      .json<Envelope<{ violations: { rule: string; slug: string }[] }>>()
      .data.violations.filter((v) => v.slug === 'card-app');
    const counts: Record<string, number> = {};
    for (const v of violations) counts[v.rule] = (counts[v.rule] ?? 0) + 1;
    const nonZero = Object.fromEntries(Object.entries(check.byRule).filter(([, n]) => n > 0));
    expect(nonZero).toEqual(counts);
  });

  it('never binds an existing prototype with --ds; only a retry with the same binding resumes', async () => {
    setup();
    await designSystem('harbor');
    const first = await run('new', 'harbor-app', '--ds', 'harbor', '--no-install');
    expect(first.code, first.stdout).toBe(0);
    const retry = await run('new', 'harbor-app', '--ds', 'harbor', '--no-install');
    expect(retry.code, retry.stdout).toBe(0);

    // A prototype made without --ds from the same template looks like a retry by id and slug.
    const plain = await run('new', 'plain-app', '--template', 'blank', '--no-install');
    expect(plain.code, plain.stdout).toBe(0);
    write('prototypes/plain-app/src/App.svelte', '<p>Edited by hand</p>\n');
    const before = read('prototypes/plain-app/protoyard.json');
    const bound = await run('new', 'plain-app', '--ds', 'harbor', '--no-install');
    expect(bound.code).not.toBe(0);
    const error = bound.json<Envelope>().error;
    expect(error?.code).toBe('conflict');
    expect(error?.hint).toContain('protoyard ds use plain-app harbor --lock');
    expect(read('prototypes/plain-app/protoyard.json')).toBe(before);
    expect(existsSync(join(root(), 'prototypes/plain-app/src/design-system.ts'))).toBe(false);
    expect(read('prototypes/plain-app/src/App.svelte')).toBe('<p>Edited by hand</p>\n');
    // An unlocked binding is not a retry of a locked one either.
    const unlocked = await run('new', 'harbor-app', '--ds', 'harbor', '--unlocked', '--no-install');
    expect(unlocked.json<Envelope>().error?.code).toBe('conflict');
  });

  it('--unlocked binds without locking: a draft and a template with violations are allowed', async () => {
    setup();
    const version = await designSystem('dusk', false);
    const result = await run(
      'new',
      'draft-app',
      '--ds',
      'dusk',
      '--template',
      'styled',
      '--unlocked',
      '--no-install'
    );
    expect(result.code, result.stdout).toBe(0);
    const data = result.json<Envelope>().data as Record<string, unknown>;
    expect(data.designSystem).toEqual({ id: 'dusk', version, locked: false });
    expect(data.designSystemCheck).toMatchObject({ ok: false });
    expect(json('prototypes/draft-app/protoyard.json').designSystem).toEqual({
      id: 'dusk',
      version,
      locked: false,
    });
    expect(read('prototypes/draft-app/src/design-system.ts')).toContain('"id": "dusk"');
  });

  it('refuses --from with --ds, and --unlocked without --ds', async () => {
    setup();
    await designSystem('harbor');
    const from = await run('new', 'remix', '--ds', 'harbor', '--from', 'blank', '--no-install');
    expect(from.code).toBe(2);
    expect(from.json<Envelope>().error?.message).toContain('may copy its visual code');
    const unlocked = await run('new', 'remix', '--template', 'blank', '--unlocked', '--no-install');
    expect(unlocked.code).toBe(2);
    expect(existsSync(join(root(), 'prototypes/remix'))).toBe(false);
  });
});

describe('protoyard generate --ds (PLAN_013 T-new-ds)', () => {
  /** The generated-or-emitted files must be clean; template-owned files are reported separately. */
  function expectGeneratorClean(check: Record<string, unknown>) {
    expect(check.generatorFiles, JSON.stringify(check)).toEqual([]);
    expect(check.bindingProblem).toBeUndefined();
  }

  it('binds an app at generation, ignores the brand, and keeps the binding across regeneration', async () => {
    ws = createWorkspace();
    addCrudTemplate(ws);
    const version = await designSystem('harbor');
    const blueprint = helpdeskBlueprint({
      brand: { id: 'helpdesk-brand', name: 'Help Brand', seed: '#62852b' },
    });
    ws.write('helpdesk.json', blueprint);
    const file = join(root(), 'helpdesk.json');
    const first = await run(
      'generate',
      'desk',
      '--blueprint',
      file,
      '--ds',
      'harbor',
      '--no-install'
    );
    const firstData = first.json<Envelope>().data as Record<string, unknown>;
    expect(firstData, first.stdout).toMatchObject({
      designSystem: { id: 'harbor', version, locked: true },
      brandIgnored: true,
    });
    expectGeneratorClean(firstData.designSystemCheck as Record<string, unknown>);
    // Exit 0 when the copied template is lock-clean; otherwise only template files fail.
    const check = firstData.designSystemCheck as { ok: boolean; templateFiles: string[] };
    expect(first.code).toBe(check.ok ? 0 : 4);
    if (!check.ok) expect(check.templateFiles.length).toBeGreaterThan(0);

    const dir = 'prototypes/desk';
    expect(json(`${dir}/protoyard.json`)).toMatchObject({
      designSystem: { id: 'harbor', version, locked: true },
      defaultTheme: 'harbor',
    });
    expect(existsSync(join(root(), dir, 'src/generated/brand-theme.ts'))).toBe(false);
    const definition = read(`${dir}/src/prototype.ts`);
    expect(definition).toContain("import { designSystemTheme } from './design-system.ts';");
    expect(definition).toContain('themes: [designSystemTheme]');
    expect(definition).not.toContain('brand-theme');
    expect(read(`${dir}/src/design-system.ts`)).toContain('"id": "harbor"');

    // Regenerate with a changed blueprint and no --ds: the binding stays.
    ws.write('helpdesk.json', { ...blueprint, description: 'Customers, tickets and more.' });
    const again = await run('generate', 'desk', '--blueprint', file, '--no-install');
    const againData = again.json<Envelope>().data as Record<string, unknown>;
    expect(againData, again.stdout).toMatchObject({
      designSystem: { id: 'harbor', version, locked: true },
      brandIgnored: true,
    });
    expectGeneratorClean(againData.designSystemCheck as Record<string, unknown>);
    expect(existsSync(join(root(), dir, 'src/generated/brand-theme.ts'))).toBe(false);
    expect(read(`${dir}/src/prototype.ts`)).toBe(definition);
    expect(json(`${dir}/protoyard.json`).designSystem).toEqual({
      id: 'harbor',
      version,
      locked: true,
    });
    const drift = await checkBlueprintDrift(join(root(), dir), 'desk', 1);
    expect(drift.problems).toEqual([]);

    // The same --ds is accepted; another one is refused.
    expect(
      (
        await run('generate', 'desk', '--blueprint', file, '--ds', 'harbor', '--no-install')
      ).json<Envelope>().error?.code
    ).not.toBe('conflict');
    await designSystem('dusk');
    const other = await run(
      'generate',
      'desk',
      '--blueprint',
      file,
      '--ds',
      'dusk',
      '--no-install'
    );
    expect(other.json<Envelope>().error?.code).toBe('conflict');
  });

  it('binds a deck, keeps it on regeneration, and ds use --upgrade works on the generated prototype', async () => {
    ws = createWorkspace();
    cpSync(join(REPO_ROOT, 'templates/deck'), join(root(), 'templates/deck'), {
      recursive: true,
      filter: (source) => !/[/\\](node_modules|dist)([/\\]|$)/.test(source),
    });
    const version = await designSystem('harbor');
    const deck = JSON.parse(
      readFileSync(
        join(REPO_ROOT, 'packages/blueprint/tests/fixtures/kinds/minimal.deck.json'),
        'utf8'
      )
    ) as Record<string, unknown>;
    ws.write('talk.json', deck);
    const file = join(root(), 'talk.json');

    // A draft cannot be locked: nothing is written.
    await designSystem('dusk', false);
    const draft = await run(
      'generate',
      'talk',
      '--blueprint',
      file,
      '--ds',
      'dusk',
      '--no-install'
    );
    expect(draft.json<Envelope>().error?.message).toContain('is a draft');
    expect(existsSync(join(root(), 'prototypes/talk'))).toBe(false);

    const first = await run(
      'generate',
      'talk',
      '--blueprint',
      file,
      '--ds',
      'harbor',
      '--no-install'
    );
    const data = first.json<Envelope>().data as Record<string, unknown>;
    expect(data, first.stdout).toMatchObject({
      designSystem: { id: 'harbor', version, locked: true },
    });
    expectGeneratorClean(data.designSystemCheck as Record<string, unknown>);
    const definition = read('prototypes/talk/src/prototype.ts');
    expect(definition).toContain(GENERATED_MARKER);
    expect(definition).toContain("import { designSystemTheme } from './design-system.ts';");
    expect(definition).toContain('brandTheme: designSystemTheme,');
    expect(definition).toContain('defaultThemeId: designSystemTheme.id,');
    expect(existsSync(join(root(), 'prototypes/talk/src/generated/brand-theme.ts'))).toBe(false);
    expect(json('prototypes/talk/package.json').dependencies).toMatchObject({
      '@protoyard/themes': 'workspace:*',
    });

    // Regeneration keeps the generated definition (hash intact) and the binding.
    ws.write('talk.json', { ...deck, name: `${String(deck.name)} (v2)` });
    const again = await run('generate', 'talk', '--blueprint', file, '--no-install');
    expect(again.json<Envelope>().data, again.stdout).toMatchObject({
      designSystem: { id: 'harbor', version, locked: true },
    });
    expect(read('prototypes/talk/src/prototype.ts')).toBe(definition);

    // A new approved version moves the pin with --upgrade on the generated prototype.
    const document = json('design-systems/harbor/document.json');
    ws.write('design-systems/harbor/document.json', { ...document, version: '9.9.9' });
    await approve('harbor');
    const upgrade = await run('ds', 'use', 'talk', 'harbor', '--upgrade');
    expect(upgrade.code, upgrade.stdout).toBe(0);
    expect(upgrade.json<Envelope>().data).toMatchObject({
      designSystem: { id: 'harbor', version: '9.9.9', locked: true },
    });
    expect(read('prototypes/talk/src/prototype.ts')).toBe(definition);
    expect(json('prototypes/talk/protoyard.json').designSystem).toEqual({
      id: 'harbor',
      version: '9.9.9',
      locked: true,
    });
    expect(
      lockedBindingProblem(root(), join(root(), 'prototypes/talk'), {
        id: 'harbor',
        version: '9.9.9',
      })
    ).toBeNull();
  });

  it('binds a page and a doc at generation; their generated files pass check ds', async () => {
    ws = createWorkspace();
    const version = await designSystem('harbor');
    for (const [kind, fixture] of [
      ['page', 'landing.page.json'],
      ['doc', 'quarterly-report.doc.json'],
    ] as const) {
      cpSync(join(REPO_ROOT, 'templates', kind), join(root(), 'templates', kind), {
        recursive: true,
        filter: (source) => !/[/\\](node_modules|dist)([/\\]|$)/.test(source),
      });
      cpSync(
        join(REPO_ROOT, 'packages/blueprint/tests/fixtures/kinds', fixture),
        join(root(), fixture)
      );
      const slug = `bound-${kind}`;
      const result = await run(
        'generate',
        slug,
        '--blueprint',
        join(root(), fixture),
        '--ds',
        'harbor',
        '--no-install'
      );
      const data = result.json<Envelope>().data as Record<string, unknown>;
      expect(data, result.stdout).toMatchObject({
        kind,
        designSystem: { id: 'harbor', version, locked: true },
      });
      expectGeneratorClean(data.designSystemCheck as Record<string, unknown>);
      const definition = read(`prototypes/${slug}/src/prototype.ts`);
      expect(definition).toContain("import { designSystemTheme } from './design-system.ts';");
      expect(definition).toContain('brandTheme: designSystemTheme,');
      // validate's drift check emits with the same binding: nothing is stale or missing.
      const again = await run(
        'generate',
        slug,
        '--blueprint',
        join(root(), fixture),
        '--no-install'
      );
      expect(again.json<Envelope>().data, again.stdout).toMatchObject({ unchanged: true });
      const schemaVersion = (
        json(`prototypes/${slug}/protoyard.json`).storage as { schemaVersion: number }
      ).schemaVersion;
      const drift = await checkBlueprintDrift(
        join(root(), 'prototypes', slug),
        slug,
        schemaVersion
      );
      expect(drift.problems).toEqual([]);
    }
  });

  it('binds an unbound generated prototype on regeneration, checking refusals before any write', async () => {
    ws = createWorkspace();
    const version = await designSystem('harbor');
    cpSync(join(REPO_ROOT, 'templates/page'), join(root(), 'templates/page'), {
      recursive: true,
      filter: (source) => !/[/\\](node_modules|dist)([/\\]|$)/.test(source),
    });
    const file = join(root(), 'landing.page.json');
    cpSync(join(REPO_ROOT, 'packages/blueprint/tests/fixtures/kinds/landing.page.json'), file);
    expect((await run('generate', 'site', '--blueprint', file, '--no-install')).code).toBe(0);
    const before = read('prototypes/site/src/prototype.ts');
    expect(before).not.toContain('design-system.ts');

    // Another design system already in src/design-system.ts: refused, nothing written.
    ws.write('prototypes/site/src/design-system.ts', '// "id": "other"\n');
    const refused = await run(
      'generate',
      'site',
      '--blueprint',
      file,
      '--ds',
      'harbor',
      '--no-install'
    );
    expect(refused.json<Envelope>().error?.code).toBe('conflict');
    expect(read('prototypes/site/src/prototype.ts')).toBe(before);
    expect(json('prototypes/site/protoyard.json').designSystem).toBeUndefined();

    rmSync(join(root(), 'prototypes/site/src/design-system.ts'));
    const bound = await run(
      'generate',
      'site',
      '--blueprint',
      file,
      '--ds',
      'harbor',
      '--no-install'
    );
    expect(bound.json<Envelope>().data, bound.stdout).toMatchObject({
      designSystem: { id: 'harbor', version, locked: true },
      regenerated: true,
    });
    expect(read('prototypes/site/src/prototype.ts')).toContain('brandTheme: designSystemTheme,');
    expect(read('prototypes/site/src/design-system.ts')).toContain('"id": "harbor"');
    const schemaVersion = (
      json('prototypes/site/protoyard.json').storage as { schemaVersion: number }
    ).schemaVersion;
    const drift = await checkBlueprintDrift(join(root(), 'prototypes/site'), 'site', schemaVersion);
    expect(drift.problems).toEqual([]);
  });

  it('ds use still refuses a generated definition the generator did not bind', async () => {
    ws = createWorkspace();
    await designSystem('harbor');
    ws.write('prototypes/plain-gen/protoyard.json', manifest({ slug: 'plain-gen' }));
    ws.write('prototypes/plain-gen/package.json', {
      name: 'plain-gen',
      private: true,
      dependencies: { '@protoyard/runtime': 'workspace:*' },
    });
    ws.write('prototypes/plain-gen/src/prototype.ts', `/** ${GENERATED_MARKER} */\n${PROTOTYPE}`);
    const refused = await run('ds', 'use', 'plain-gen', 'harbor', '--lock');
    expect(refused.code).not.toBe(0);
    expect(refused.json<Envelope>().error?.hint).toContain('--ds harbor');
  });
});

describe('MCP new_from_design_system', () => {
  it('validates strictly and never lets a value become an option', async () => {
    const handler = createMcpToolHandler({
      runCli: async () => ({ ok: true, command: 'new', data: {} }),
    });
    for (const args of [
      { slug: 'a' },
      { ds: 'harbor' },
      { slug: 'Bad Slug', ds: 'harbor' },
      { slug: 'ok', ds: 'Not An Id' },
      { slug: 'ok', ds: 'harbor', from: 'other' },
      { slug: 'ok', ds: 'harbor', name: 'two\nlines' },
      { slug: 'ok', ds: 'harbor', template: '--evil' },
      { slug: 'ok', ds: 'harbor', unlocked: 'yes' },
    ]) {
      expect(await handler('new_from_design_system', args), JSON.stringify(args)).toMatchObject({
        ok: false,
        error: { code: 'validation' },
      });
    }
    const argv = cliArgs('new_from_design_system', {
      slug: 'ok',
      ds: 'harbor',
      template: 'blank',
      unlocked: true,
      name: '-Name',
      description: '--version',
    });
    expect(argv).toEqual([
      'new',
      '--ds=harbor',
      '--template=blank',
      '--unlocked',
      '--name=-Name',
      '--description=--version',
      '--no-install',
      '--',
      'ok',
    ]);
  });

  it('creates a locked prototype through the CLI', async () => {
    setup();
    const version = await designSystem('harbor');
    const handler = createMcpToolHandler({
      workspaceRoot: root(),
      runCli: async (args) => {
        const result = await cli(['--root', root(), '--json', ...args]);
        return JSON.parse(result.stdout);
      },
    });
    const created = await handler('new_from_design_system', {
      slug: 'mcp-app',
      ds: 'harbor',
      name: 'MCP App',
    });
    expect(created).toMatchObject({
      ok: true,
      command: 'new',
      data: { designSystem: { id: 'harbor', version, locked: true }, install: { skipped: true } },
    });
    expect(json('prototypes/mcp-app/protoyard.json').name).toBe('MCP App');
    const refused = await handler('new_from_design_system', {
      slug: 'mcp-styled',
      ds: 'harbor',
      template: 'styled',
    });
    expect(refused).toMatchObject({ ok: false, error: { code: 'validation' } });
  });
});
