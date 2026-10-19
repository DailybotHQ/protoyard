// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  analyzeBundle,
  type BundleReport,
  classifyChunks,
  VITE_MANIFEST_PATH,
  type ViteManifest,
} from '../src/lib/bundle-analysis.ts';
import { addBuildablePrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

/** Shape of a real build: entry → shared (static), entry ⇢ faker (dynamic), faker → shared + vendor. */
const MANIFEST: ViteManifest = {
  'index.html': {
    file: 'assets/index-a1.js',
    src: 'index.html',
    isEntry: true,
    imports: ['_shared-b2.js'],
    dynamicImports: ['node_modules/@faker-js/faker/dist/index.js', 'src/devtools.ts'],
    css: ['assets/index-c3.css'],
  },
  '_shared-b2.js': { file: 'assets/shared-b2.js' },
  'node_modules/@faker-js/faker/dist/index.js': {
    file: 'assets/dist-d4.js',
    isDynamicEntry: true,
    imports: ['_shared-b2.js', '_vendor-e5.js'],
  },
  '_vendor-e5.js': { file: 'assets/vendor-e5.js' },
  'src/devtools.ts': {
    file: 'assets/devtools-f6.js',
    isDynamicEntry: true,
    css: ['assets/devtools-g7.css'],
  },
  // Emitted but never referenced: still not part of the first download.
  '_orphan-h8.js': { file: 'assets/orphan-h8.js' },
};

describe('classifyChunks (graph walk)', () => {
  it('counts entries and their static imports as initial, everything else as lazy', () => {
    expect(classifyChunks(MANIFEST)).toEqual({
      initialJs: ['assets/index-a1.js', 'assets/shared-b2.js'],
      lazyJs: [
        'assets/devtools-f6.js',
        'assets/dist-d4.js',
        'assets/orphan-h8.js',
        'assets/vendor-e5.js',
      ],
      initialCss: ['assets/index-c3.css'],
      lazyCss: ['assets/devtools-g7.css'],
    });
  });

  it('follows static imports transitively and survives cycles', () => {
    const cyclic: ViteManifest = {
      main: { file: 'a.js', isEntry: true, imports: ['b'] },
      b: { file: 'b.js', imports: ['c'] },
      c: { file: 'c.js', imports: ['b'], dynamicImports: ['d'] },
      d: { file: 'd.js', isDynamicEntry: true, imports: ['c'] },
    };
    expect(classifyChunks(cyclic)).toMatchObject({
      initialJs: ['a.js', 'b.js', 'c.js'],
      lazyJs: ['d.js'],
    });
  });

  it('treats everything as lazy when no chunk is an entry', () => {
    expect(classifyChunks({ x: { file: 'x.js' } })).toMatchObject({
      initialJs: [],
      lazyJs: ['x.js'],
    });
  });
});

describe('analyzeBundle', () => {
  let dir: string;
  const contents: Record<string, string> = {
    'index.html': '<script type="module" src="./assets/index-a1.js"></script>',
    'assets/index-a1.js': 'console.log("entry");'.repeat(40),
    'assets/shared-b2.js': 'export const shared = 1;'.repeat(10),
    'assets/dist-d4.js': 'export const faker = "lots of locale data";'.repeat(200),
    'assets/vendor-e5.js': 'export const v = 2;',
    'assets/devtools-f6.js': 'export const d = 3;',
    'assets/orphan-h8.js': 'export const o = 4;',
    'assets/index-c3.css': 'body{color:red}'.repeat(20),
    'assets/devtools-g7.css': '.d{color:blue}',
    'sw.js': 'self.addEventListener("fetch",()=>{});',
  };
  const gz = (text: string) => gzipSync(Buffer.from(text), { level: 9 }).length;

  beforeAll(() => {
    const ws = createWorkspace();
    dir = join(ws.root, 'dist');
    for (const [file, text] of Object.entries(contents)) ws.write(`dist/${file}`, text);
    ws.write(`dist/${VITE_MANIFEST_PATH}`, MANIFEST);
  });

  it('measures gzip level 9 per kind, then deletes the Vite manifest', async () => {
    const report = (await analyzeBundle(dir)) as BundleReport;
    expect(report.initialJsGzip).toBe(
      gz(contents['assets/index-a1.js'] as string) + gz(contents['assets/shared-b2.js'] as string)
    );
    expect(report.lazyJsGzip).toBe(
      ['assets/dist-d4.js', 'assets/vendor-e5.js', 'assets/devtools-f6.js', 'assets/orphan-h8.js']
        .map((f) => gz(contents[f] as string))
        .reduce((a, b) => a + b, 0)
    );
    expect(report.cssGzip).toBe(
      gz(contents['assets/index-c3.css'] as string) +
        gz(contents['assets/devtools-g7.css'] as string)
    );
    expect(report.totalGzip).toBe(
      Object.values(contents)
        .map(gz)
        .reduce((a, b) => a + b, 0)
    );
    // sw.js and index.html are counted in the total, never as app chunks.
    expect(report.chunks.map((c) => `${c.kind}:${c.file}`).sort()).toEqual([
      'css:assets/devtools-g7.css',
      'css:assets/index-c3.css',
      'initial:assets/index-a1.js',
      'initial:assets/shared-b2.js',
      'lazy:assets/devtools-f6.js',
      'lazy:assets/dist-d4.js',
      'lazy:assets/orphan-h8.js',
      'lazy:assets/vendor-e5.js',
    ]);
    expect(existsSync(join(dir, VITE_MANIFEST_PATH))).toBe(false);
    expect(existsSync(join(dir, '.vite'))).toBe(false);
  });

  it('returns null when the build wrote no manifest', async () => {
    expect(await analyzeBundle(dir)).toBeNull();
  });
});

// Each test runs a real `vite build`, which can pass the
// default 5 s on a heavily loaded machine. Same 60 s allowance as build.test.ts.
describe('build integration (real Vite)', () => {
  let ws: TempWorkspace;
  beforeAll(() => {
    ws = createWorkspace();
    addBuildablePrototype(ws, 'lazy-app');
    const base = 'prototypes/lazy-app';
    // Same manifest setting as defineProtoyardConfig, without its plugin stack.
    ws.write(
      `${base}/vite.config.ts`,
      `export default { logLevel: "silent", build: { manifest: ${JSON.stringify(VITE_MANIFEST_PATH)} } };\n`
    );
    ws.write(
      `${base}/src/main.ts`,
      "document.getElementById('app')!.textContent = 'hi';\ndocument.addEventListener('click', () => import('./heavy.ts').then((m) => console.log(m.data)));\n"
    );
    ws.write(`${base}/src/heavy.ts`, `export const data = ${JSON.stringify('x'.repeat(5000))};\n`);
  });
  afterAll(() => ws.cleanup());

  it('records the bundle in build-manifest.json and keeps .vite out of dist', async () => {
    const run = await cli(['--root', ws.root, '--json', 'build', 'lazy-app']);
    expect(run.code).toBe(0);
    const bundle = run.json<{ data: { bundle: BundleReport } }>().data.bundle;
    expect(bundle.initialJsGzip).toBeGreaterThan(0);
    expect(bundle.chunks.filter((c) => c.kind === 'initial')).toHaveLength(1);
    expect(bundle.chunks.filter((c) => c.kind === 'lazy')).toHaveLength(1);
    const manifest = JSON.parse(
      readFileSync(join(ws.root, 'artifacts/lazy-app/build-manifest.json'), 'utf8')
    ) as { bundle: BundleReport; files: { path: string }[] };
    expect(manifest.bundle).toEqual(bundle);
    expect(manifest.files.map((f) => f.path).some((p) => p.startsWith('.vite'))).toBe(false);
    expect(existsSync(join(ws.root, 'artifacts/lazy-app/dist/.vite'))).toBe(false);
  }, 60_000);

  it('reports no bundle (and still builds) without a Vite manifest', async () => {
    ws.write('prototypes/lazy-app/vite.config.ts', 'export default { logLevel: "silent" };\n');
    const run = await cli(['--root', ws.root, '--json', 'build', 'lazy-app']);
    expect(run.code).toBe(0);
    expect(run.json<{ data: { bundle: unknown } }>().data.bundle).toBeNull();
  }, 60_000);
});

describe('crm-demo (real renderer config)', () => {
  let out: string;
  beforeAll(() => {
    out = join(mkdtempSync(join(tmpdir(), 'protoyard-bundle-')), 'dist');
  });
  afterAll(() => rmSync(resolve(out, '..'), { recursive: true, force: true }));

  it('keeps Faker lazy and the initial JS under the 250 KB gzip budget', async () => {
    const run = await cli([
      '--root',
      REPO_ROOT,
      '--json',
      'build',
      'crm-demo',
      '--out',
      out,
      '--allow-external-out',
    ]);
    expect(run.code, run.stdout + run.stderr).toBe(0);
    const bundle = run.json<{ data: { bundle: BundleReport } }>().data.bundle;
    expect(bundle.initialJsGzip).toBeLessThan(250 * 1024);
    const holdsFaker = (file: string) =>
      readFileSync(join(out, file), 'utf8').includes('FakerLocaleProxy');
    const fakerChunks = bundle.chunks.filter((c) => c.file.endsWith('.js') && holdsFaker(c.file));
    expect(fakerChunks.length).toBeGreaterThan(0);
    expect(fakerChunks.every((c) => c.kind === 'lazy')).toBe(true);
    expect(existsSync(join(out, '.vite'))).toBe(false);
  }, 180_000);
});
