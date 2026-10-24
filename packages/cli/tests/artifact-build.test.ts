// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseManifest } from '@protoyard/core';
import { build } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildTarget,
  defineProtoyardConfig,
  resolveProtoyardSettings,
  targetBuildOptions,
} from '../../renderer-svelte/src/vite.ts';
import { buildEnv } from '../src/lib/vite.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/*
 * The artifact export builds one script chunk (an artifact version holds at
 * most 511 files, and lazy chunks count against it). The CLI records the
 * target explicitly in PROTOYARD_TARGET; the shared renderer config turns it
 * into one script and one stylesheet; a plain build keeps its lazy chunks.
 */

const manifest = parseManifest({
  id: 'example.single',
  slug: 'single-app',
  name: 'Single',
  version: '1.0.0',
  storage: { namespace: 'single-app', schemaVersion: 1 },
});

const baseEnv = {
  outDir: '/out',
  base: './',
  includeDevtools: false,
} as const;

let ws: TempWorkspace | undefined;
const temps: string[] = [];
afterEach(() => {
  ws?.cleanup();
  ws = undefined;
  vi.unstubAllEnvs();
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('PROTOYARD_TARGET propagation', () => {
  it('sets the artifact target, and clears an inherited one for a plain build', () => {
    vi.stubEnv('PROTOYARD_TARGET', 'artifact');
    expect(buildEnv({ ...baseEnv, target: 'artifact' }).PROTOYARD_TARGET).toBe('artifact');
    expect(buildEnv(baseEnv).PROTOYARD_TARGET).toBe('');
  });

  it('parses the target strictly and only for builds', () => {
    expect(buildTarget({})).toBeNull();
    expect(buildTarget({ PROTOYARD_TARGET: ' ' })).toBeNull();
    expect(buildTarget({ PROTOYARD_TARGET: 'artifact' })).toBe('artifact');
    expect(() => buildTarget({ PROTOYARD_TARGET: 'artefact' })).toThrow(/PROTOYARD_TARGET/);
    const env = { PROTOYARD_TARGET: 'artifact' };
    expect(resolveProtoyardSettings(manifest, 'build', env, '/p').target).toBe('artifact');
    expect(resolveProtoyardSettings(manifest, 'serve', env, '/p').target).toBeNull();
  });

  it('turns only the artifact target into a single-chunk build shape', () => {
    expect(targetBuildOptions(null)).toEqual({});
    expect(targetBuildOptions('artifact')).toEqual({
      cssCodeSplit: false,
      rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'app', test: /./ }] } } },
    });
    const root = mkdtempSync(join(tmpdir(), 'protoyard-target-'));
    temps.push(root);
    writeFileSync(join(root, 'protoyard.json'), JSON.stringify(manifest));
    const configEnv = {
      command: 'build',
      mode: 'production',
      isSsrBuild: false,
      isPreview: false,
    } as const;
    const plain = defineProtoyardConfig({ root })(configEnv);
    expect(plain.build?.cssCodeSplit).toBeUndefined();
    // A plain build only groups Texuli's styles into one stylesheet chunk.
    const groups = (
      plain.build?.rolldownOptions?.output as { codeSplitting?: { groups?: { name: string }[] } }
    )?.codeSplitting?.groups;
    expect(groups?.map((group) => group.name)).toEqual(['texuli-css']);
    vi.stubEnv('PROTOYARD_TARGET', 'artifact');
    const artifact = defineProtoyardConfig({ root })(configEnv);
    expect(artifact.build?.cssCodeSplit).toBe(false);
    expect(artifact.build?.rolldownOptions).toEqual(targetBuildOptions('artifact').rolldownOptions);
    // Everything else about the build is the same.
    expect(artifact.build?.outDir).toBe(plain.build?.outDir);
    expect(artifact.build?.manifest).toBe(plain.build?.manifest);
  });
});

/** A prototype with one lazy module that brings its own stylesheet. */
function lazyFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'protoyard-chunks-'));
  temps.push(root);
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'protoyard.json'), JSON.stringify(manifest));
  writeFileSync(
    join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="UTF-8" /><title>Single</title></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>\n'
  );
  writeFileSync(join(root, 'src/main.css'), 'body { margin: 0; }\n');
  writeFileSync(
    join(root, 'src/main.ts'),
    "import './main.css';\nconst app = document.getElementById('app');\nif (app) app.textContent = 'home';\nvoid import('./lazy.ts').then((m) => m.show());\n"
  );
  writeFileSync(join(root, 'src/lazy.css'), '.lazy-screen { color: rgb(1 2 3); }\n');
  writeFileSync(
    join(root, 'src/lazy.ts'),
    "import './lazy.css';\nexport function show() {\n  document.body.dataset.lazy = 'lazy-screen-loaded';\n}\nexport function unusedExport() {\n  return 'lazy-export-never-called';\n}\n"
  );
  return root;
}

async function buildFixture(target: 'artifact' | null) {
  const root = lazyFixture();
  const outDir = join(root, 'dist');
  vi.stubEnv('PROTOYARD_OUT_DIR', outDir);
  vi.stubEnv('PROTOYARD_TARGET', target ?? '');
  const config = defineProtoyardConfig({ root, avatars: false })({
    command: 'build',
    mode: 'production',
    isSsrBuild: false,
    isPreview: false,
  });
  await build({ ...config, configFile: false, logLevel: 'silent' });
  const assets = readdirSync(join(outDir, 'assets'));
  const read = (name: string) => readFileSync(join(outDir, 'assets', name), 'utf8');
  return {
    scripts: assets.filter((f) => f.endsWith('.js')),
    styles: assets.filter((f) => f.endsWith('.css')),
    read,
  };
}

describe('artifact build shape (real Vite build)', () => {
  it('emits one script chunk and one stylesheet for the artifact target', async () => {
    const { scripts, styles, read } = await buildFixture('artifact');
    expect(scripts).toHaveLength(1);
    expect(styles).toHaveLength(1);
    // The lazy module and its CSS are inside the single files.
    expect(read(scripts[0] as string)).toContain('lazy-screen-loaded');
    expect(read(styles[0] as string)).toContain('.lazy-screen');
    // Tree-shaking of the lazy module's namespace survives (with
    // `codeSplitting: false` Rolldown keeps every export, e.g. all Faker locales).
    expect(read(scripts[0] as string)).not.toContain('lazy-export-never-called');
  }, 120_000);

  it('keeps lazy chunks and split CSS for a plain build', async () => {
    const { scripts, styles, read } = await buildFixture(null);
    expect(scripts.length).toBeGreaterThanOrEqual(2);
    expect(styles.length).toBeGreaterThanOrEqual(2);
    const lazy = scripts.filter((f) => read(f).includes('lazy-screen-loaded'));
    expect(lazy).toHaveLength(1);
    expect(scripts.filter((f) => !lazy.includes(f)).length).toBeGreaterThanOrEqual(1);
  }, 120_000);
});

/** A sharable prototype whose plain config bakes PROTOYARD_TARGET into the bundle. */
function addTargetProbe(workspace: TempWorkspace, slug = 'probe-app') {
  addPrototype(workspace, slug);
  const base = `prototypes/${slug}`;
  workspace.write(`${base}/package.json`, { name: `@prototype/${slug}`, private: true });
  workspace.write(
    `${base}/vite.config.ts`,
    'export default { logLevel: "silent", define: { __TARGET__: JSON.stringify(process.env.PROTOYARD_TARGET ?? "unset") } };\n'
  );
  workspace.write(
    `${base}/index.html`,
    '<!doctype html><html><head><meta charset="UTF-8" /><title>Probe App</title></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>\n'
  );
  workspace.write(
    `${base}/src/main.ts`,
    'declare const __TARGET__: string;\ndocument.getElementById("app")!.textContent = "target=[" + __TARGET__ + "]";\n'
  );
}

const bundleText = (dir: string) =>
  readdirSync(join(dir, 'assets'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(dir, 'assets', f), 'utf8'))
    .join('\n');

describe('the CLI records the target', () => {
  it('builds `export --target artifact` with PROTOYARD_TARGET=artifact and records it', async () => {
    ws = createWorkspace();
    addTargetProbe(ws);
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'export',
      'probe-app',
      '--target',
      'artifact',
    ]);
    expect(run.code, run.stderr).toBe(0);
    expect(bundleText(join(ws.root, 'artifacts/probe-app/artifact'))).toContain(
      'target=[artifact]'
    );
    const record = JSON.parse(
      readFileSync(join(ws.root, 'artifacts/probe-app/artifact-build.json'), 'utf8')
    );
    expect(record).toMatchObject({ target: 'artifact', frameWhenEmbedded: true });
  }, 120_000);

  it('builds a plain build with an empty target even when the shell exports one', async () => {
    ws = createWorkspace();
    addTargetProbe(ws);
    const run = await cli(['--root', ws.root, '--json', 'build', 'probe-app'], {
      PROTOYARD_TARGET: 'artifact',
    });
    expect(run.code, run.stderr).toBe(0);
    expect(bundleText(join(ws.root, 'artifacts/probe-app/dist'))).toContain('target=[]');
    const record = JSON.parse(
      readFileSync(join(ws.root, 'artifacts/probe-app/build-manifest.json'), 'utf8')
    );
    expect(record).not.toHaveProperty('target');
  }, 120_000);

  it('refuses --skip-build over an artifact build made without the single-chunk target', async () => {
    ws = createWorkspace();
    addTargetProbe(ws);
    const first = await cli([
      '--root',
      ws.root,
      '--json',
      'export',
      'probe-app',
      '--target',
      'artifact',
    ]);
    expect(first.code, first.stderr).toBe(0);
    const recordPath = join(ws.root, 'artifacts/probe-app/artifact-build.json');
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    delete record.target;
    writeFileSync(recordPath, JSON.stringify(record));
    const reuse = await cli([
      '--root',
      ws.root,
      '--json',
      'export',
      'probe-app',
      '--target',
      'artifact',
      '--skip-build',
    ]);
    expect(reuse.code).toBe(4);
    expect(reuse.stdout + reuse.stderr).toMatch(/single-chunk artifact target/);
  }, 120_000);
});
