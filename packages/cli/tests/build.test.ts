// @vitest-environment node
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanForForeignCode, verifyDist } from '../src/lib/build.ts';
import { digestDirectory, sha256Text } from '../src/lib/checksum.ts';
import { workspacePaths } from '../src/lib/paths.ts';
import { buildIndex } from '../src/lib/registry.ts';
import { zipDirectory } from '../src/lib/zip.ts';
import { addBuildablePrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

let ws: TempWorkspace;
beforeAll(() => {
  ws = createWorkspace();
  addBuildablePrototype(ws, 'alpha-app', 'alpha says hi');
  addBuildablePrototype(ws, 'beta-app', 'beta says hi');
  addBuildablePrototype(ws, 'starter', 'template says hi');
  // Turn the last one into a template (same layout, templates/ folder, kind template).
  renameSync(join(ws.root, 'prototypes/starter'), join(ws.root, 'templates/starter'));
  ws.write('templates/starter/protoyard.json', {
    ...JSON.parse(readFileSync(join(ws.root, 'templates/starter/protoyard.json'), 'utf8')),
    id: 'template.starter',
    kind: 'template',
  });
});
afterAll(() => ws.cleanup());

describe('checksums, dist verification and zip', () => {
  it('digests files deterministically and zips byte-identically', async () => {
    ws.write('tmp-dist/index.html', '<script type="module" src="./assets/app.js"></script>');
    ws.write('tmp-dist/assets/app.js', 'console.log(1)');
    const dir = join(ws.root, 'tmp-dist');
    const digests = await digestDirectory(dir);
    expect(digests.map((d) => d.path)).toEqual(['assets/app.js', 'index.html']);
    expect(digests[0]?.sha256).toBe(sha256Text('console.log(1)'));
    expect(await verifyDist(dir, './')).toEqual([]);

    const a = await zipDirectory(dir, join(ws.root, 'a.zip'));
    const b = await zipDirectory(dir, join(ws.root, 'b.zip'));
    expect(a.sha256).toBe(b.sha256);
    const entries = unzipSync(new Uint8Array(readFileSync(join(ws.root, 'a.zip'))));
    expect(Object.keys(entries).sort()).toEqual(['assets/app.js', 'index.html']);
  });

  it('flags missing assets referenced by index.html', async () => {
    ws.write('bad-dist/index.html', '<script type="module" src="/demo/assets/gone.js"></script>');
    expect(await verifyDist(join(ws.root, 'bad-dist'), '/demo/')).toEqual([
      'index.html references missing file "/demo/assets/gone.js".',
    ]);
  });
});

describe('build and export (real Vite)', () => {
  it('builds ONE prototype into artifacts/<slug>/dist with a build manifest', async () => {
    const run = await cli(['--root', ws.root, '--json', 'build', 'alpha-app']);
    expect(run.stdout).toContain('"ok": true');
    expect(run.code).toBe(0);
    const data = run.json<{ data: { outDir: string; fileCount: number } }>().data;
    expect(data.outDir).toBe('artifacts/alpha-app/dist');

    const manifest = JSON.parse(
      readFileSync(join(ws.root, 'artifacts/alpha-app/build-manifest.json'), 'utf8')
    );
    expect(manifest).toMatchObject({
      format: 'protoyard.build',
      slug: 'alpha-app',
      id: 'example.alpha-app',
      base: './',
      includeDevtools: false,
    });
    expect(manifest.files.length).toBe(data.fileCount);
    expect(manifest.totalBytes).toBe(
      manifest.files.reduce((s: number, f: { size: number }) => s + f.size, 0)
    );
    const html = readFileSync(join(ws.root, 'artifacts/alpha-app/dist/index.html'), 'utf8');
    expect(html).toContain('./assets/');
    expect(existsSync(join(ws.root, 'artifacts/beta-app'))).toBe(false);
  }, 60_000);

  it('honours --base for sub-path hosting', async () => {
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'build',
      'beta-app',
      '--base',
      '/demos/beta',
    ]);
    expect(run.code).toBe(0);
    const html = readFileSync(join(ws.root, 'artifacts/beta-app/dist/index.html'), 'utf8');
    expect(html).toContain('/demos/beta/assets/');
  }, 60_000);

  it('builds templates too, into artifacts/templates/<name>/', async () => {
    const run = await cli(['--root', ws.root, '--json', 'build', 'starter']);
    expect(run.code).toBe(0);
    expect(run.json<{ data: { outDir: string } }>().data.outDir).toBe(
      'artifacts/templates/starter/dist'
    );
    expect(existsSync(join(ws.root, 'artifacts/templates/starter/build-manifest.json'))).toBe(true);
  }, 60_000);

  it('refuses an --out that would overwrite sources', async () => {
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'build',
      'alpha-app',
      '--out',
      'prototypes',
    ]);
    expect(run.code).toBe(2);
    expect(run.json<{ error: { code: string } }>().error.code).toBe('unsafe_path');
  });

  it('exports a zip that contains only that prototype', async () => {
    const run = await cli(['--root', ws.root, '--json', 'export', 'alpha-app']);
    expect(run.code).toBe(0);
    const data = run.json<{ data: { zip: string; sha256: string; size: number } }>().data;
    expect(data.zip).toBe('artifacts/alpha-app/alpha-app.zip');
    const bytes = new Uint8Array(readFileSync(join(ws.root, data.zip)));
    expect(sha256Text(bytes)).toBe(data.sha256);
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toContain('index.html');
    const text = Object.values(files)
      .map((f) => new TextDecoder().decode(f))
      .join('\n');
    expect(text).toContain('alpha says hi');
    expect(text).not.toContain('beta says hi');

    const skip = await cli(['--root', ws.root, '--json', 'export', 'alpha-app', '--skip-build']);
    expect(skip.code).toBe(0);
    expect(skip.json<{ data: { sha256: string } }>().data.sha256).toBe(data.sha256);
  }, 60_000);

  it('detects another prototype id leaking into a bundle', async () => {
    const paths = workspacePaths(ws.root);
    const { registry } = await buildIndex(paths);
    const alpha = registry.entries.find((e) => e.slug === 'alpha-app');
    if (!alpha) throw new Error('fixture missing');
    ws.write(
      'artifacts/alpha-app/dist/assets/docs.js',
      'const hint = `id must be dotted, e.g. "example.beta-app"`;'
    );
    const clean = await scanForForeignCode(
      join(ws.root, 'artifacts/alpha-app/dist'),
      alpha,
      registry.entries
    );
    expect(clean).toEqual([]);
    ws.write(
      'artifacts/alpha-app/dist/assets/leak.js',
      'const m={id:`example.beta-app`,slug:`beta-app`};'
    );
    const leaks = await scanForForeignCode(
      join(ws.root, 'artifacts/alpha-app/dist'),
      alpha,
      registry.entries
    );
    expect(leaks).toEqual([{ file: 'assets/leak.js', id: 'example.beta-app', slug: 'beta-app' }]);
    const run = await cli(['--root', ws.root, '--json', 'export', 'alpha-app', '--skip-build']);
    // The leak file also changed dist, so the manifest check fails first.
    expect(run.code).toBe(4);
  });
});
