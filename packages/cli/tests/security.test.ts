// @vitest-environment node
/**
 * Regression tests for the wave-4 security audit (SECURITY_AUDIT.md):
 * each case reproduces a proof of concept and asserts it is refused.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startControlServer } from '../src/control-server.ts';
import { listFiles } from '../src/lib/checksum.ts';
import { BUILD_MARKER, guardOutputDir, SHOWCASE_MARKER } from '../src/lib/output-guard.ts';
import { CASE_INSENSITIVE_FS, workspacePaths } from '../src/lib/paths.ts';
import { buildIndex } from '../src/lib/registry.ts';
import { serveStatic, sirvCandidates } from '../src/lib/static-server.ts';
import {
  addBuildablePrototype,
  addPrototype,
  addTemplate,
  cli,
  createWorkspace,
  type TempWorkspace,
} from './helpers.ts';

let ws: TempWorkspace;
let outside: string;
beforeAll(() => {
  ws = createWorkspace();
  for (const dir of [
    'docs',
    'scripts',
    '.github',
    'tests',
    'packages/core',
    'node_modules',
    '.git',
    'artifacts',
    'tmp',
  ]) {
    mkdirSync(join(ws.root, dir), { recursive: true });
  }
  ws.write('docs/keep.md', '# keep');
  ws.write('misc/notes.txt', 'user file');
  addBuildablePrototype(ws, 'app-one');
  outside = mkdtempSync(join(tmpdir(), 'protoyard-outside-'));
});
afterAll(() => {
  ws.cleanup();
  rmSync(outside, { recursive: true, force: true });
});

const guard = (requested: string, options: { marker?: string; allowExternal?: boolean } = {}) =>
  guardOutputDir({
    root: ws.root,
    paths: workspacePaths(ws.root),
    requested,
    marker: options.marker ?? BUILD_MARKER,
    ...(options.allowExternal ? { allowExternal: true } : {}),
  });

describe('C1/C2 output allow-list', () => {
  it('refuses source, tooling and history folders, and the zones themselves', () => {
    for (const bad of [
      'docs',
      'scripts',
      '.github',
      'tests',
      'packages',
      'packages/core/dist',
      'prototypes/app-one/dist',
      '.git',
      'node_modules/x',
      'artifacts',
      'tmp',
      '.',
      '..',
    ]) {
      expect(() => guard(bad), bad).toThrow(/Refusing/);
    }
  });

  it('refuses outside folders unless explicitly allowed, and then only empty/new ones', () => {
    expect(() => guard(join(outside, 'new'))).toThrow(/outside the workspace/);
    expect(() => guard('../escape')).toThrow(/outside the workspace|parent/);
    expect(guard(join(outside, 'new'), { allowExternal: true })).toMatch(/new$/);
    writeFileSync(join(outside, 'precious.txt'), 'x');
    expect(() => guard(outside, { allowExternal: true })).toThrow(/did not create/);
    expect(() => guard(tmpdir(), { allowExternal: true })).toThrow(/Refusing/);
  });

  it('allows artifacts/** and tmp/**, and new, empty or marked folders elsewhere in the workspace', () => {
    expect(guard('artifacts/custom')).toContain('artifacts');
    expect(guard('tmp/out')).toContain('tmp');
    expect(guard('brand-new-out')).toMatch(/brand-new-out$/);
    expect(() => guard('misc')).toThrow(/did not create/);
    ws.write('marked/.protoyard-out', '{}');
    ws.write('marked/index.html', 'old');
    expect(guard('marked')).toMatch(/marked$/);
    ws.write('site/.protoyard-showcase', '{}');
    ws.write('site/index.html', 'old');
    expect(() => guard('site')).toThrow(/did not create/); // wrong marker for a build
    expect(guard('site', { marker: SHOWCASE_MARKER })).toMatch(/site$/);
  });

  it.runIf(CASE_INSENSITIVE_FS)('C3: letter-case variants of protected folders are refused', () => {
    for (const bad of ['DOCS', 'Packages', 'PROTOTYPES/app-one/dist', '.GIT', 'Node_Modules']) {
      expect(() => guard(bad), bad).toThrow(/Refusing/);
    }
  });

  it('C3: symlinks cannot smuggle a protected folder in, and outputs are never symlinks', () => {
    symlinkSync(join(ws.root, 'docs'), join(ws.root, 'tmp', 'link-to-docs'));
    symlinkSync(join(ws.root, 'prototypes'), join(ws.root, 'artifacts', 'link-to-prototypes'));
    expect(() => guard('tmp/link-to-docs')).toThrow(/symlink/);
    expect(() => guard('artifacts/link-to-prototypes/app-one')).toThrow(/prototypes/);
    expect(readFileSync(join(ws.root, 'docs/keep.md'), 'utf8')).toBe('# keep');
  });

  it('build --out docs is refused with exit 2 and deletes nothing (PoC)', async () => {
    const run = await cli(['--root', ws.root, '--json', 'build', 'app-one', '--out', 'docs']);
    expect(run.code).toBe(2);
    expect(run.json<{ error: { code: string } }>().error.code).toBe('unsafe_path');
    expect(existsSync(join(ws.root, 'docs/keep.md'))).toBe(true);
  });

  it('showcase --out .git / node_modules is refused before anything runs (PoC)', async () => {
    for (const out of ['.git', 'node_modules', 'docs']) {
      const run = await cli([
        '--root',
        ws.root,
        '--json',
        'showcase',
        '--out',
        out,
        '--skip-build',
        '--serve',
      ]);
      expect(run.code, out).toBe(2);
    }
  });

  it('a custom --out is marked, rebuildable, and never overwrites the default build manifest (I10)', async () => {
    const first = await cli(['--root', ws.root, '--json', 'build', 'app-one']);
    expect(first.code).toBe(0);
    const defaultManifest = readFileSync(
      join(ws.root, 'artifacts/app-one/build-manifest.json'),
      'utf8'
    );
    for (let i = 0; i < 2; i++) {
      const custom = await cli([
        '--root',
        ws.root,
        '--json',
        'build',
        'app-one',
        '--out',
        'custom-out',
        '--base',
        '/sub/',
      ]);
      expect(custom.code, `run ${i}`).toBe(0);
    }
    expect(readFileSync(join(ws.root, 'artifacts/app-one/build-manifest.json'), 'utf8')).toBe(
      defaultManifest
    );
    const marker = JSON.parse(readFileSync(join(ws.root, 'custom-out', BUILD_MARKER), 'utf8'));
    expect(marker.base).toBe('/sub/');
    // Bookkeeping never lands in digests or ZIPs.
    expect(
      (await listFiles(join(ws.root, 'custom-out'))).some((f) => f.endsWith(BUILD_MARKER))
    ).toBe(false);
  }, 90_000);
});

describe('M1/H1 symlinks in prototypes', () => {
  it('refuses to build a prototype whose public/ links outside it, and validate reports it', async () => {
    addBuildablePrototype(ws, 'leaky');
    writeFileSync(join(outside, 'secret.txt'), 'FAKE-SECRET');
    mkdirSync(join(ws.root, 'prototypes/leaky/public'), { recursive: true });
    symlinkSync(join(outside, 'secret.txt'), join(ws.root, 'prototypes/leaky/public/pkg.json'));
    const build = await cli(['--root', ws.root, '--json', 'build', 'leaky']);
    expect(build.code).toBe(4);
    expect(build.json<{ error: { hint: string } }>().error.hint).toContain('public/pkg.json');
    expect(existsSync(join(ws.root, 'artifacts/leaky/dist'))).toBe(false);
    const validate = await cli([
      '--root',
      ws.root,
      '--json',
      'validate',
      'leaky',
      '--skip-typecheck',
    ]);
    const checks = validate.json<{ data: { checks: { id: string; status: string }[] } }>().data
      .checks;
    expect(checks.find((c) => c.id === 'symlinks')?.status).toBe('fail');
  });

  it('does not index symlinked prototype folders or symlinked manifests', async () => {
    const elsewhere = join(outside, 'evil');
    mkdirSync(elsewhere, { recursive: true });
    writeFileSync(
      join(elsewhere, 'protoyard.json'),
      JSON.stringify({
        id: 'x.evil',
        slug: 'evil',
        name: 'Evil',
        version: '0.1.0',
        storage: { namespace: 'evil', schemaVersion: 1 },
      })
    );
    symlinkSync(elsewhere, join(ws.root, 'prototypes', 'evil'));
    addPrototype(ws, 'linked-manifest');
    rmSync(join(ws.root, 'prototypes/linked-manifest/protoyard.json'));
    symlinkSync(
      join(elsewhere, 'protoyard.json'),
      join(ws.root, 'prototypes/linked-manifest/protoyard.json')
    );
    const { registry } = await buildIndex(workspacePaths(ws.root));
    expect(registry.entries.map((e) => e.slug)).not.toContain('evil');
    expect(registry.entries.map((e) => e.slug)).not.toContain('linked-manifest');
    const issues = Object.fromEntries(registry.invalid.map((i) => [i.path, i.errors.join(' ')]));
    expect(issues['prototypes/evil']).toMatch(/symlink/);
    expect(issues['prototypes/linked-manifest']).toMatch(/symlink/);
  });
});

function get(port: number, path: string) {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>(
    (resolve, reject) => {
      const req = request(
        { host: '127.0.0.1', port, path, headers: { Host: `127.0.0.1:${port}` } },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
        }
      );
      req.on('error', reject);
      req.end();
    }
  );
}

describe('static server and control server hardening', () => {
  it('serves files, refuses symlinks leaving dist, rejects bad escapes, sends nosniff', async () => {
    const dist = join(ws.root, 'tmp', 'served');
    mkdirSync(join(dist, 'leakdir'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<p>ok</p>');
    writeFileSync(join(outside, 'SECURITY.md'), 'FAKE-OUTSIDE');
    symlinkSync(join(outside, 'SECURITY.md'), join(dist, 'leakdir', 'SECURITY.md'));
    const server = await serveStatic({
      dir: dist,
      base: './',
      port: 0,
      host: '127.0.0.1',
      strictPort: true,
    });
    try {
      const ok = await get(server.port, '/index.html');
      expect(ok.status).toBe(200);
      expect(ok.headers['x-content-type-options']).toBe('nosniff');
      const leak = await get(server.port, '/leakdir/SECURITY.md');
      expect(leak.status).toBe(403);
      expect(leak.body).not.toContain('FAKE-OUTSIDE');
      expect((await get(server.port, '/%E0%A4%A')).status).toBe(400);
    } finally {
      await server.close();
    }
  });

  it('control server answers 400, not 500, to a malformed slug escape (I1)', async () => {
    const control = await startControlServer({ root: ws.root, port: 0 });
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const req = request(
          {
            host: '127.0.0.1',
            port: control.port,
            method: 'POST',
            path: '/api/dev/%E0%A4%A',
            headers: { Host: `127.0.0.1:${control.port}`, Origin: 'http://localhost:4321' },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          }
        );
        req.on('error', reject);
        req.end();
      });
      expect(status).toBe(400);
    } finally {
      await control.close();
    }
  });
});

describe('new: template hygiene (I3, I4)', () => {
  it('never copies .env*, .envrc, .npmrc or .git, keeps .env.example, and keeps $& literal in names', async () => {
    addTemplate(ws, 'starter');
    ws.write('templates/starter/.env', 'TOKEN=fake-local-secret');
    ws.write('templates/starter/.env.local', 'X=1');
    ws.write('templates/starter/.env.example', 'TOKEN=');
    ws.write('templates/starter/.npmrc', '//r/:_authToken=fake');
    ws.write('templates/starter/.git/HEAD', 'ref: refs/heads/main');
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'new',
      'from-starter',
      '--template',
      'starter',
      '--no-install',
      '--name',
      'Cost $& Co',
    ]);
    expect(run.code).toBe(0);
    const dir = join(ws.root, 'prototypes/from-starter');
    for (const name of ['.env', '.env.local', '.npmrc', '.git'])
      expect(existsSync(join(dir, name)), name).toBe(false);
    expect(existsSync(join(dir, '.env.example'))).toBe(true);
    expect(readFileSync(join(dir, 'README.md'), 'utf8').split('\n')[0]).toBe('# Cost $& Co');
  });
});

describe('L3: publish --dry-run stays offline', () => {
  it('never spawns npx (which would query the npm registry)', async () => {
    const bin = join(outside, 'bin');
    const log = join(outside, 'npx-called.log');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'npx'), `#!/bin/sh\necho "$@" >> "${log}"\nexit 1\n`);
    chmodSync(join(bin, 'npx'), 0o755);
    const run = await cli(
      ['--root', ws.root, '--json', 'publish', 'app-one', '--provider', 'netlify', '--dry-run'],
      {
        PATH: `${bin}:${process.env.PATH ?? ''}`,
      }
    );
    expect(run.code).toBe(0);
    expect(existsSync(log)).toBe(false);
    vi.unstubAllEnvs();
  }, 90_000);
});

describe('final review regressions (W1, W2, I3, I4, I6, I7)', () => {
  it('W1: a link inside a nested public/dist/ is still refused', async () => {
    addBuildablePrototype(ws, 'nested-leak');
    writeFileSync(join(outside, 'leak.txt'), 'FAKE-NESTED-SECRET');
    mkdirSync(join(ws.root, 'prototypes/nested-leak/public/dist'), { recursive: true });
    symlinkSync(
      join(outside, 'leak.txt'),
      join(ws.root, 'prototypes/nested-leak/public/dist/leak.txt')
    );
    const run = await cli(['--root', ws.root, '--json', 'build', 'nested-leak']);
    expect(run.code).toBe(4);
    expect(run.json<{ error: { hint: string } }>().error.hint).toContain('public/dist/leak.txt');
  });

  it('W2: validate refuses (and never builds) a symlinked prototype folder', async () => {
    const real = join(outside, 'linked-proto');
    mkdirSync(real, { recursive: true });
    writeFileSync(
      join(real, 'protoyard.json'),
      JSON.stringify({
        id: 'x.linked-proto',
        slug: 'linked-proto',
        name: 'Linked',
        version: '0.1.0',
        storage: { namespace: 'linked-proto', schemaVersion: 1 },
      })
    );
    symlinkSync(real, join(ws.root, 'prototypes', 'linked-proto'));
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'validate',
      'linked-proto',
      '--skip-typecheck',
      '--build',
    ]);
    expect(run.code).toBe(4);
    const checks = run.json<{
      data: { checks: { id: string; status: string; details: string[] }[] };
    }>().data.checks;
    expect(checks.find((c) => c.id === 'manifest')?.details.join(' ')).toMatch(/symlink/);
    expect(checks.find((c) => c.id === 'build')?.status ?? 'skip').toBe('skip');
    expect(existsSync(join(ws.root, 'artifacts/linked-proto'))).toBe(false);
  });

  it('I3: index and extension fallbacks cannot serve a symlinked file', async () => {
    const dist = join(ws.root, 'tmp', 'served-fallbacks');
    mkdirSync(join(dist, 'docs'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<p>root</p>');
    writeFileSync(join(outside, 'page.html'), 'FAKE-PAGE-SECRET');
    symlinkSync(join(outside, 'page.html'), join(dist, 'docs', 'index.html'));
    symlinkSync(join(outside, 'page.html'), join(dist, 'about.html'));
    const server = await serveStatic({
      dir: dist,
      base: './',
      port: 0,
      host: '127.0.0.1',
      strictPort: true,
    });
    try {
      for (const path of ['/docs/', '/docs', '/about']) {
        const res = await get(server.port, path);
        expect(res.body, path).not.toContain('FAKE-PAGE-SECRET');
      }
      // sirv also tries an extension-less <dir>/index (W-C1) …
      mkdirSync(join(dist, 'bare'), { recursive: true });
      symlinkSync(join(outside, 'page.html'), join(dist, 'bare', 'index'));
      for (const path of ['/bare', '/bare/']) {
        const res = await get(server.port, path);
        expect(res.body, path).not.toContain('FAKE-PAGE-SECRET');
      }
      // … and a file literally named with an encoded slash is decoded like sirv does (I-C2).
      symlinkSync(join(outside, 'page.html'), join(dist, 'a%2Fb'));
      expect((await get(server.port, '/a%252Fb')).body).not.toContain('FAKE-PAGE-SECRET');
      expect((await get(server.port, '/a%2Fb')).body).not.toContain('FAKE-PAGE-SECRET');
      // Regular directory indexes and extension lookups still work.
      mkdirSync(join(dist, 'guide'), { recursive: true });
      writeFileSync(join(dist, 'guide', 'index.html'), '<p>guide</p>');
      writeFileSync(join(dist, 'faq.html'), '<p>faq</p>');
      expect((await get(server.port, '/')).body).toContain('root');
      expect((await get(server.port, '/guide/')).body).toContain('guide');
      expect((await get(server.port, '/faq')).body).toContain('faq');
    } finally {
      await server.close();
    }
  });

  it('I4: publish never uploads the build marker', async () => {
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'publish',
      'app-one',
      '--provider',
      'static',
    ]);
    expect(run.code).toBe(0);
    expect(existsSync(join(ws.root, 'artifacts/app-one/dist', BUILD_MARKER))).toBe(false);
  }, 60_000);

  it('I6: a prototype may not take a folder name the CLI owns in artifacts/', async () => {
    addBuildablePrototype(ws, 'showcase-builds');
    const run = await cli(['--root', ws.root, '--json', 'build', 'showcase-builds']);
    expect(run.code).toBe(2);
    expect(run.json<{ error: { message: string } }>().error.message).toMatch(/collides/);
  });

  it('I7: snapshot list reports malformed files instead of crashing', async () => {
    ws.write('prototypes/app-one/snapshots/null-tables.protoyard.json', {
      format: 'protoyard.snapshot',
      tables: null,
    });
    ws.write('prototypes/app-one/snapshots/null.protoyard.json', 'null');
    const run = await cli(['--root', ws.root, '--json', 'snapshot', 'list', 'app-one']);
    expect(run.code).toBe(4);
    const files = run.json<{ data: { files: { file: string; ok: boolean }[] } }>().data.files;
    expect(
      files
        .filter((f) => !f.ok)
        .map((f) => f.file)
        .sort()
    ).toEqual(['null-tables.protoyard.json', 'null.protoyard.json']);
  });
});

describe('sirv lookup mirror (W-C1, I-C3)', () => {
  it("lists exactly sirv's candidates, plus the SPA root fallback", () => {
    expect(sirvCandidates('/foo', false)).toEqual([
      '/foo',
      '/foo/index',
      '/foo.html',
      '/foo/index.html',
      '/foo.htm',
      '/foo/index.htm',
    ]);
    expect(sirvCandidates('/foo/', true).slice(-3)).toEqual([
      '/index',
      '/index.html',
      '/index.htm',
    ]);
    // The root never checks a sibling of the served folder (dist.html).
    expect(sirvCandidates('/', false)).toEqual(['/index', '/index.html', '/index.htm']);
  });

  it('refuses an SPA fallback whose root index is a symlink leaving the folder', async () => {
    const dist = join(ws.root, 'tmp', 'spa-root');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(outside, 'spa.html'), 'FAKE-SPA-SECRET');
    symlinkSync(join(outside, 'spa.html'), join(dist, 'index.html'));
    const server = await serveStatic({
      dir: dist,
      base: './',
      port: 0,
      host: '127.0.0.1',
      strictPort: true,
    });
    try {
      for (const path of ['/', '/some/route']) {
        const res = await get(server.port, path);
        expect(res.status, path).toBe(403);
        expect(res.body).not.toContain('FAKE-SPA-SECRET');
      }
    } finally {
      await server.close();
    }
  });
});
