// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import {
  attwProblems,
  checkPackages,
  fileFindings,
  findCandidates,
  formatTable,
  localSpecifierFindings,
  manifestFindings,
  parseArgs,
  payloadPrefixes,
  readTarball,
} from '../../../scripts/check-packages.ts';

/**
 * `pnpm check:packages` (scripts/check-packages.ts): every rule fires on a
 * fixture package that breaks it, a clean published-shaped package passes the
 * real pnpm pack + publint + attw pipeline, and pending packages only fail
 * with --require-all.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const bytes = (text: string) => new TextEncoder().encode(text);

function files(entries: Record<string, string>): Map<string, Uint8Array> {
  return new Map(Object.entries(entries).map(([path, text]) => [path, bytes(text)]));
}

function write(path: string, content: string | object) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
}

/** A minimal ustar archive (gzipped) with optional prefix-split names. */
function tarball(entries: { name: string; prefix?: string; body: string }[]): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (const entry of entries) {
    const body = bytes(entry.body);
    const header = new Uint8Array(512);
    const put = (text: string, at: number) => header.set(bytes(text), at);
    put(entry.name, 0);
    put('0000644\0', 100);
    put(`${body.length.toString(8).padStart(11, '0')}\0`, 124);
    put('0', 156);
    put('ustar\0', 257);
    if (entry.prefix) put(entry.prefix, 345);
    put('        ', 148);
    const sum = header.reduce((total, byte) => total + byte, 0);
    put(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
    blocks.push(header, body, new Uint8Array((512 - (body.length % 512)) % 512));
  }
  blocks.push(new Uint8Array(1024));
  const tar = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0));
  let offset = 0;
  for (const block of blocks) {
    tar.set(block, offset);
    offset += block.length;
  }
  return gzipSync(tar);
}

describe('manifestFindings', () => {
  it('flags a version off the lockstep line and install lifecycle scripts', () => {
    const findings = manifestFindings(
      {
        name: 'x',
        version: '0.9.0',
        scripts: { postinstall: 'node a.js', preinstall: 'x', build: 'tsc' },
      },
      '1.0.0'
    );
    expect(findings.map((f) => f.rule)).toEqual(['version', 'install-script', 'install-script']);
    expect(findings.map((f) => f.message).join(' ')).toMatch(/preinstall.*postinstall/);
  });

  it('accepts the lockstep version and ordinary scripts', () => {
    expect(manifestFindings({ version: '1.0.0', scripts: { prepack: 'x' } }, '1.0.0')).toEqual([]);
  });
});

describe('localSpecifierFindings', () => {
  it('flags workspace:, link: and file: in any dependency field', () => {
    const findings = localSpecifierFindings({
      dependencies: { a: 'workspace:*', b: '^1.0.0' },
      peerDependencies: { c: 'link:../c' },
      optionalDependencies: { d: 'file:../d.tgz' },
    });
    expect(findings.map((f) => f.message)).toEqual([
      'dependencies.a is "workspace:*" in the packed manifest',
      'peerDependencies.c is "link:../c" in the packed manifest',
      'optionalDependencies.d is "file:../d.tgz" in the packed manifest',
    ]);
  });
});

describe('fileFindings', () => {
  it('flags tests, fixtures, snapshots and environment files', () => {
    const findings = fileFindings(
      files({
        'tests/a.test.ts': '',
        'dist/b.spec.js': '',
        'src/fixtures/world.json': '{}',
        'dist/__snapshots__/x.snap': '',
        '.env': 'TOKEN=x',
        '.env.local': '',
        '.env.example': 'TOKEN=',
        'dist/index.js': '',
      })
    );
    expect(findings.every((f) => f.rule === 'forbidden-file')).toBe(true);
    expect(findings.map((f) => f.message.split(' ')[0])).toEqual([
      '.env',
      '.env.local',
      'dist/__snapshots__/x.snap',
      'dist/b.spec.js',
      'src/fixtures/world.json',
      'tests/a.test.ts',
    ]);
  });

  it('allows TypeScript source only as the target of a packed declaration map', () => {
    const findings = fileFindings(
      files({
        'dist/index.d.ts': 'export {};',
        'dist/index.d.ts.map': JSON.stringify({ version: 3, sources: ['../src/index.ts'] }),
        'src/index.ts': 'export {};',
        'src/stray.ts': 'export {};',
        'src/view.svelte': '',
        'dist/types.d.mts': '',
      })
    );
    expect(findings).toEqual([
      {
        rule: 'source-file',
        message: 'src/stray.ts is TypeScript source that no packed declaration map references',
      },
    ]);
  });

  it('lets declared payload folders ship sources and tests, but never env files', () => {
    const payload = payloadPrefixes({
      protoyard: { pack: { payload: ['templates', 'src/', '/abs', '../up', ''] } },
    });
    expect(payload).toEqual(['templates/', 'src/']);
    const findings = fileFindings(
      files({
        'templates/blank/src/main.ts': 'export {};',
        'templates/blank/tests/smoke.test.ts': '',
        'templates/blank/.env.local': 'TOKEN=x',
        'src/pages/index.ts': 'export {};',
        'lib/stray.ts': 'export {};',
        'tests/a.test.ts': '',
      }),
      payload
    );
    expect(findings.map((f) => `${f.rule} ${f.message.split(' ')[0]}`)).toEqual([
      'source-file lib/stray.ts',
      'forbidden-file templates/blank/.env.local',
      'forbidden-file tests/a.test.ts',
    ]);
  });

  it('reports an unreadable declaration map', () => {
    expect(fileFindings(files({ 'dist/x.d.ts.map': '{nope' })).map((f) => f.rule)).toEqual([
      'forbidden-file',
    ]);
  });
});

describe('readTarball', () => {
  it('strips package/ and joins ustar prefixes', () => {
    const read = readTarball(
      tarball([
        { name: 'package/package.json', body: '{"name":"x"}' },
        { name: 'index.js', prefix: 'package/dist/deep', body: 'export {};' },
      ])
    );
    expect([...read.keys()]).toEqual(['package.json', 'dist/deep/index.js']);
    expect(new TextDecoder().decode(read.get('dist/deep/index.js'))).toBe('export {};');
  });
});

describe('attwProblems', () => {
  it('keeps only problems the esm-only profile counts', () => {
    const json = JSON.stringify({
      analysis: {
        problems: [
          { kind: 'NoResolution', entrypoint: '.', resolutionKind: 'node10' },
          { kind: 'CJSResolvesToESM', entrypoint: '.', resolutionKind: 'node16-cjs' },
          { kind: 'NoResolution', entrypoint: './x', resolutionKind: 'bundler' },
          { kind: 'InternalResolutionError', entrypoint: '.', resolutionKind: 'node16-esm' },
        ],
      },
    });
    expect(attwProblems(json).map((p) => `${p.kind}:${p.resolutionKind}`)).toEqual([
      'NoResolution:bundler',
      'InternalResolutionError:node16-esm',
    ]);
  });
});

describe('parseArgs', () => {
  it('reads every flag and rejects unknown ones', () => {
    const options = parseArgs([
      '--json',
      '--require-all',
      '--filter',
      '@protoyard/core',
      '--max-bytes',
      '1024',
      '--root',
      'tmp',
    ]);
    expect(options).toMatchObject({
      json: true,
      requireAll: true,
      filter: ['@protoyard/core'],
      maxBytes: 1024,
    });
    expect(options.root?.endsWith('tmp')).toBe(true);
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown option/);
    expect(() => parseArgs(['--max-bytes', '0'])).toThrow(/positive integer/);
  });
});

/**
 * A fixture workspace: root package.json at 1.0.0 and packages/* folders.
 * `clean` is published-shaped (dist exports and types via publishConfig).
 */
function workspace(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-check-packages-test-')));
  roots.push(root);
  write(join(root, 'package.json'), { name: 'fixture-workspace', private: true, version: '1.0.0' });
  return root;
}

function cleanPackage(dir: string, name: string, overrides: object = {}) {
  write(join(dir, 'package.json'), {
    name,
    version: '1.0.0',
    description: 'Fixture package.',
    license: 'MIT',
    type: 'module',
    sideEffects: false,
    exports: { '.': './src/index.ts' },
    files: ['dist'],
    publishConfig: {
      exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      types: './dist/index.d.ts',
    },
    ...overrides,
  });
  write(join(dir, 'README.md'), `# ${name}\n`);
  write(join(dir, 'LICENSE'), 'MIT License (fixture)\n');
  write(join(dir, 'src', 'index.ts'), 'export const answer: number = 42;\n');
  write(join(dir, 'dist', 'index.js'), 'export const answer = 42;\n');
  write(join(dir, 'dist', 'index.d.ts'), 'export declare const answer: number;\n');
}

describe('checkPackages on fixture packages (real pnpm pack, publint and attw)', () => {
  it('passes a clean package, keeps a pending one pending and skips private ones', async () => {
    const root = workspace();
    cleanPackage(join(root, 'packages', 'clean'), '@fixture/clean');
    write(join(root, 'packages', 'pending', 'package.json'), {
      name: '@fixture/pending',
      version: '1.0.0',
      exports: { '.': './src/index.ts' },
    });
    write(join(root, 'packages', 'secret', 'package.json'), {
      name: '@fixture/secret',
      version: '0.0.1',
      private: true,
    });

    expect(findCandidates(root).map((c) => c.manifest.name)).toEqual([
      '@fixture/clean',
      '@fixture/pending',
    ]);
    const report = await checkPackages({ root });
    const clean = report.packages.find((p) => p.name === '@fixture/clean');
    expect(clean?.findings).toEqual([]);
    expect(clean?.status).toBe('pass');
    expect(clean?.fileCount).toBe(5);
    expect(clean?.tarballBytes).toBeGreaterThan(0);
    const pending = report.packages.find((p) => p.name === '@fixture/pending');
    expect(pending?.status).toBe('pending');
    expect(pending?.tarballBytes).toBeUndefined();
    expect(report.ok).toBe(true);
    expect(formatTable(report)).toMatch(/1 pass, 0 fail, 1 pending/);

    const strict = await checkPackages({ root, requireAll: true, attw: false });
    expect(strict.ok).toBe(false);
  }, 120_000);

  it('flags every packed violation on one broken package', async () => {
    const root = workspace();
    const dir = join(root, 'packages', 'broken');
    cleanPackage(dir, '@fixture/broken', {
      version: '0.9.0',
      files: ['dist', 'src', 'tests', '.env.local'],
      scripts: { postinstall: 'node dist/index.js' },
      publishConfig: {
        // publint: the entry does not exist; attw: types do not resolve.
        exports: { '.': { types: './dist/missing.d.ts', default: './dist/missing.js' } },
      },
    });
    write(join(dir, 'src', 'stray.ts'), 'export {};\n');
    write(join(dir, 'tests', 'broken.test.ts'), 'export {};\n');
    write(join(dir, '.env.local'), 'TOKEN=fixture\n');

    const report = await checkPackages({ root, maxBytes: 100 });
    const broken = report.packages[0];
    expect(broken?.status).toBe('fail');
    const rules = new Set(broken?.findings.map((f) => f.rule));
    for (const rule of [
      'version',
      'install-script',
      'forbidden-file',
      'source-file',
      'size',
      'publint',
      'attw',
    ]) {
      expect(rules, rule).toContain(rule);
    }
    const messages = broken?.findings.map((f) => f.message).join('\n') ?? '';
    expect(messages).toContain('tests/broken.test.ts');
    expect(messages).toContain('.env.local');
    expect(messages).toContain('src/stray.ts');
    expect(report.ok).toBe(false);
  }, 120_000);

  it('rejects an unknown --filter name', async () => {
    const root = workspace();
    await expect(checkPackages({ root, filter: ['@fixture/none'] })).rejects.toThrow(
      /Unknown package/
    );
  });
});

describe('the pnpm check:packages command', () => {
  it('prints a JSON report, exits 1 on a violation and 2 on bad usage', () => {
    const root = workspace();
    cleanPackage(join(root, 'packages', 'off'), '@fixture/off', { version: '2.0.0' });
    const run = (args: string[]) =>
      spawnSync('pnpm', ['exec', 'tsx', 'scripts/check-packages.ts', ...args], {
        cwd: REPO,
        encoding: 'utf8',
      });
    const failing = run(['--root', root, '--json']);
    expect(failing.status).toBe(1);
    const report = JSON.parse(failing.stdout) as { format: string; packages: { status: string }[] };
    expect(report.format).toBe('protoyard.check-packages');
    expect(report.packages.map((p) => p.status)).toEqual(['fail']);
    expect(run(['--nope']).status).toBe(2);
  }, 120_000);
});
