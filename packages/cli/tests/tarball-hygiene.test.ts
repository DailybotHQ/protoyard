// @vitest-environment node
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkPackages, hygieneFindings } from '../../../scripts/check-packages.ts';
import {
  isBinary,
  parseAllowFile,
  scanTarballFiles,
} from '../../../scripts/lib/tarball-hygiene.ts';

/**
 * Tarball hygiene (scripts/lib/tarball-hygiene.ts, run by check:packages):
 * secrets, key and env files, home paths (also inside source maps) and real
 * emails in what npm would ship are reported by path and line, never echoed.
 *
 * Secret-shaped strings are assembled at run time so this tracked file never
 * matches the repository's own public-hygiene check.
 */

const AWS = `AKIA${'Q'.repeat(16)}`;
const GITHUB = `ghp_${'a'.repeat(36)}`;
const PRIVATE_KEY = ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ');
const HOME = ['', 'Users', 'someone', 'work', 'protoyard'].join('/');
const LINUX_HOME = ['', 'home', 'someone', 'src'].join('/');
const WINDOWS_HOME = ['C:', 'Users', 'someone', 'src'].join('\\');
const REAL_EMAIL = ['jane', 'acme-corp.io'].join('@');

const bytes = (text: string) => new TextEncoder().encode(text);
const files = (entries: Record<string, string | Uint8Array>) =>
  new Map(Object.entries(entries).map(([path, v]) => [path, typeof v === 'string' ? bytes(v) : v]));

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('scanTarballFiles', () => {
  it('reports planted secrets by path, line and rule', () => {
    const findings = scanTarballFiles(
      files({
        'dist/index.js': `export const a = 1;\nexport const b = 2;\nconst k = "${AWS}";\n`,
        'dist/gh.js': `// ${GITHUB}\n`,
        'dist/key.txt': `${PRIVATE_KEY}\n`,
      })
    );
    expect(findings).toEqual([
      { path: 'dist/gh.js', line: 1, rule: 'secret-github' },
      { path: 'dist/index.js', line: 3, rule: 'secret-aws' },
      { path: 'dist/key.txt', line: 1, rule: 'secret-private-key' },
    ]);
  });

  it('reports home paths in code and inside source maps, including absolute map sources', () => {
    const map = JSON.stringify({
      version: 3,
      sourceRoot: '',
      sources: [`${HOME}/packages/core/src/index.ts`],
      sourcesContent: [`// built on ${LINUX_HOME}\n`],
      mappings: 'AAAA',
    });
    const findings = scanTarballFiles(
      files({
        'dist/index.d.ts.map': map,
        'dist/win.js': `const root = "${WINDOWS_HOME}";\n`,
        'dist/ok.js': `const ci = "${['', 'home', 'runner', 'work'].join('/')}";\n`,
      })
    );
    expect(findings).toEqual([
      { path: 'dist/index.d.ts.map', line: 1, rule: 'personal-path' },
      { path: 'dist/index.d.ts.map', line: 1, rule: 'source-map-path' },
      { path: 'dist/win.js', line: 1, rule: 'personal-path' },
    ]);
  });

  it('accepts relative map sources', () => {
    const map = JSON.stringify({ version: 3, sources: ['../src/index.ts'], mappings: 'AAAA' });
    expect(scanTarballFiles(files({ 'dist/index.js.map': map }))).toEqual([]);
  });

  it('reports real emails and accepts reserved example domains and public aliases', () => {
    const findings = scanTarballFiles(
      files({
        'README.md': [
          'Contact: ada@example.com, team@northstar.example, qa@shop.test, x@nowhere.invalid',
          `Real: ${REAL_EMAIL}`,
          'Security: security@dailybot.com',
          'dev@localhost.localhost',
        ].join('\n'),
      })
    );
    expect(findings).toEqual([{ path: 'README.md', line: 2, rule: 'real-email' }]);
  });

  it('reports env and key files; .env.example is allowed', () => {
    const findings = scanTarballFiles(
      files({
        '.env': 'A=1',
        'config/.env.production': 'A=1',
        '.envrc': 'export A=1',
        '.env.example': 'A=',
        'certs/server.pem': 'x',
        'ssh/id_ed25519': 'x',
        '.npmrc': 'registry=https://registry.npmjs.org/',
      })
    );
    expect(findings.map((f) => `${f.path}:${f.rule}`)).toEqual([
      '.env:env-file',
      '.envrc:env-file',
      '.npmrc:key-file',
      'certs/server.pem:key-file',
      'config/.env.production:env-file',
      'ssh/id_ed25519:key-file',
    ]);
  });

  it('skips content rules for binary files but keeps file rules', () => {
    const binary = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, ...bytes(AWS)]);
    expect(isBinary(binary)).toBe(true);
    expect(isBinary(bytes('plain text'))).toBe(false);
    expect(scanTarballFiles(files({ 'assets/a.webp': binary, 'keys/a.key': binary }))).toEqual([
      { path: 'keys/a.key', line: 1, rule: 'key-file' },
    ]);
  });

  it('allows a fake secret only by repository path, secret rule and a fake marker on the line', () => {
    const allow = parseAllowFile(
      [
        '# comment',
        'packages/demo/dist/fixture.js secret-aws fake key for the demo',
        'packages/demo/dist/fixture.js personal-path not allowed: only secret-* rules',
        'packages/demo/dist/no-reason.js secret-aws',
      ].join('\n')
    );
    expect(allow).toEqual([{ path: 'packages/demo/dist/fixture.js', rule: 'secret-aws' }]);
    const tarball = files({
      'dist/fixture.js': `const fake = "${AWS}";\nconst real = "${AWS}";\n`,
    });
    expect(scanTarballFiles(tarball, { packagePath: 'packages/demo', allow })).toEqual([
      { path: 'dist/fixture.js', line: 2, rule: 'secret-aws' },
    ]);
    // A different package path does not inherit the allow entry.
    expect(scanTarballFiles(tarball, { packagePath: 'packages/other', allow })).toHaveLength(2);
  });
});

describe('hygieneFindings in check:packages', () => {
  it('formats findings as path:line: rule without the matched text', () => {
    const findings = hygieneFindings(
      files({ 'dist/index.js': `const k = "${AWS}";` }),
      'packages/demo',
      realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-hygiene-noallow-')))
    );
    expect(findings).toEqual([{ rule: 'hygiene', message: 'dist/index.js:1: secret-aws' }]);
  });
});

function write(path: string, content: string | object) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
}

describe('check:packages on a fixture tarball with planted secrets', () => {
  it('reports every planted secret and home path with file and line, and never echoes them', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-hygiene-pack-')));
    roots.push(root);
    write(join(root, 'package.json'), {
      name: 'fixture-workspace',
      private: true,
      version: '1.0.0',
    });
    write(
      join(root, '.public-hygiene-allow'),
      'packages/leaky/dist/fixture.js secret-github fake token for the fixture\n'
    );
    const dir = join(root, 'packages', 'leaky');
    write(join(dir, 'package.json'), {
      name: '@fixture/leaky',
      version: '1.0.0',
      license: 'MIT',
      type: 'module',
      files: ['dist'],
      exports: { '.': './src/index.ts' },
      publishConfig: {
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
        types: './dist/index.d.ts',
      },
    });
    write(join(dir, 'README.md'), `# Leaky\n\nMaintainer: ${REAL_EMAIL}\n`);
    write(join(dir, 'LICENSE'), 'MIT License (fixture)\n');
    write(join(dir, 'dist', 'index.js'), `export const answer = 42;\nconst key = "${AWS}";\n`);
    write(join(dir, 'dist', 'index.d.ts'), 'export declare const answer: number;\n');
    write(
      join(dir, 'dist', 'index.d.ts.map'),
      JSON.stringify({ version: 3, sources: [`${HOME}/src/index.ts`], mappings: 'AAAA' })
    );
    write(join(dir, 'dist', 'fixture.js'), `export const t = "${GITHUB}"; // fake fixture\n`);

    const report = await checkPackages({ root, attw: false });
    const leaky = report.packages[0];
    expect(leaky?.status).toBe('fail');
    const hygiene = leaky?.findings.filter((f) => f.rule === 'hygiene').map((f) => f.message);
    expect(hygiene).toEqual([
      'dist/index.d.ts.map:1: personal-path',
      'dist/index.d.ts.map:1: source-map-path',
      'dist/index.js:2: secret-aws',
      'README.md:3: real-email',
    ]);
    const serialized = JSON.stringify(report);
    for (const planted of [AWS, GITHUB, HOME, REAL_EMAIL]) {
      expect(serialized).not.toContain(planted);
    }
  }, 120_000);
});
