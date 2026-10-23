// @vitest-environment node
/**
 * The engine packages' dist builds work in plain Node, the
 * way npm consumers get them: every exported subpath has JavaScript and a
 * declaration, no emitted import still names a `.ts` file, and every export
 * imports from a fresh node_modules that holds only the dist folders (no
 * sources, no NODE_PATH, no workspace links).
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPackages } from '../../../scripts/build-packages.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ENGINE = [
  'core',
  'database',
  'scenarios',
  'runtime',
  'themes',
  'blueprint',
  'blocks',
  'decks',
  'pages',
  'flows',
  'gamification',
  'charts',
  'analytics',
  'views',
  'review',
  'ai',
  'saas',
  'http',
  'offline',
  'avatars',
] as const;

interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
  exports: Record<string, string>;
  protoyard?: { build?: { group?: string } };
}

const manifest = (dir: string): Manifest =>
  JSON.parse(readFileSync(join(ROOT, 'packages', dir, 'package.json'), 'utf8')) as Manifest;

/** `./src/a/index.ts` → `./dist/a/index.js` (and `.d.ts`); assets keep their name under dist. */
function distTarget(target: string): { js: string; dts: string | null } | null {
  if (!target.startsWith('./src/')) return null;
  const rest = target.slice('./src/'.length);
  if (/\.tsx?$/.test(rest)) {
    const base = rest.replace(/\.tsx?$/, '');
    return { js: `./dist/${base}.js`, dts: `./dist/${base}.d.ts` };
  }
  return { js: `./dist/${rest}`, dts: null };
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
  );
}

/**
 * Whether a package's dist is missing or older than its sources: no
 * `dist/index.js`, a declared export target that is not built, or a source
 * file newer than the oldest declared output. A dist left from an earlier
 * build would otherwise be tested instead of the current code.
 */
function staleDist(dir: string): boolean {
  const base = join(ROOT, 'packages', dir);
  const index = join(base, 'dist', 'index.js');
  if (!existsSync(index)) return dir !== 'review';
  const outputs = [index];
  for (const value of Object.values(manifest(dir).exports)) {
    const mapped = distTarget(value);
    if (!mapped) continue;
    for (const file of [mapped.js, mapped.dts]) {
      if (!file) continue;
      const path = join(base, file);
      if (!existsSync(path)) return true;
      outputs.push(path);
    }
  }
  const builtAt = Math.min(...outputs.map((path) => statSync(path).mtimeMs));
  return walk(join(base, 'src')).some((file) => statSync(file).mtimeMs > builtAt);
}

let consumer: string;
beforeAll(async () => {
  if (ENGINE.some(staleDist)) {
    const built = await buildPackages({ root: ROOT, filters: ['engine'] });
    if (!built.ok) throw new Error(`engine build failed: ${JSON.stringify(built.packages)}`);
  }
  // A consumer node_modules with dist-only copies and the real third-party dependencies.
  consumer = realpathSync(mkdtempSync(join(tmpdir(), 'protoyard-dist-')));
  const modules = join(consumer, 'node_modules');
  for (const dir of ENGINE) {
    const pkg = manifest(dir);
    const target = join(modules, pkg.name);
    mkdirSync(target, { recursive: true });
    cpSync(join(ROOT, 'packages', dir, 'dist'), join(target, 'dist'), { recursive: true });
    const exports = Object.fromEntries(
      Object.entries(pkg.exports).flatMap(([key, value]) => {
        const mapped = distTarget(value);
        return mapped ? [[key, mapped.js]] : [];
      })
    );
    writeFileSync(
      join(target, 'package.json'),
      JSON.stringify({ name: pkg.name, version: '0.0.0', type: 'module', exports })
    );
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      if (dep.startsWith('@protoyard/') || existsSync(join(modules, dep))) continue;
      const source = join(ROOT, 'packages', dir, 'node_modules', dep);
      if (!existsSync(source)) continue;
      mkdirSync(dirname(join(modules, dep)), { recursive: true });
      symlinkSync(realpathSync(source), join(modules, dep));
    }
  }
}, 600_000);
afterAll(() => {
  if (consumer) rmSync(consumer, { recursive: true, force: true });
});

describe('engine package dist builds', () => {
  it('every engine package opts into the engine build group', () => {
    for (const dir of ENGINE) {
      expect(manifest(dir).protoyard?.build?.group, dir).toBe('engine');
      expect(existsSync(join(ROOT, 'packages', dir, 'tsconfig.build.json')), dir).toBe(true);
    }
  });

  it('emits JavaScript and declarations for every exported subpath, plus the declared assets', () => {
    for (const dir of ENGINE) {
      const base = join(ROOT, 'packages', dir);
      for (const [key, value] of Object.entries(manifest(dir).exports)) {
        const mapped = distTarget(value);
        if (!mapped) continue;
        expect(existsSync(join(base, mapped.js)), `${dir} ${key} → ${mapped.js}`).toBe(true);
        if (mapped.dts)
          expect(existsSync(join(base, mapped.dts)), `${dir} ${key} → ${mapped.dts}`).toBe(true);
      }
    }
    expect(existsSync(join(ROOT, 'packages/themes/dist/base.css'))).toBe(true);
    expect(existsSync(join(ROOT, 'packages/themes/dist/fonts.css'))).toBe(true);
    expect(existsSync(join(ROOT, 'packages/avatars/dist/manifest.json'))).toBe(true);
    expect(existsSync(join(ROOT, 'packages/blueprint/dist/schema/blueprint.schema.json'))).toBe(
      true
    );
  });

  it('never emits a .ts import specifier or test files', () => {
    for (const dir of ENGINE) {
      for (const file of walk(join(ROOT, 'packages', dir, 'dist'))) {
        expect(file, dir).not.toMatch(/\.(test|spec)\.(js|d\.ts)$/);
        if (!file.endsWith('.js')) continue;
        const text = readFileSync(file, 'utf8');
        expect(text, file).not.toMatch(/from\s+["'][^"']+\.tsx?["']/);
        expect(text, file).not.toMatch(/import\(\s*["'][^"']+\.tsx?["']\s*\)/);
      }
    }
  });

  it('imports every engine export in plain Node from dist only', () => {
    const specifiers = ENGINE.flatMap((dir) => {
      const pkg = manifest(dir);
      return Object.entries(pkg.exports)
        .filter(([, value]) => /\.tsx?$/.test(value) && value.startsWith('./src/'))
        .map(([key]) => (key === '.' ? pkg.name : `${pkg.name}/${key.slice(2)}`));
    });
    expect(specifiers.length).toBeGreaterThan(50);
    const script = `
const failures = [];
const typesOnly = [];
for (const specifier of ${JSON.stringify(specifiers)}) {
  try {
    const mod = await import(specifier);
    if (Object.keys(mod).length === 0) typesOnly.push(specifier);
  } catch (error) {
    failures.push([specifier, String(error && error.message || error).split('\\n')[0]]);
  }
}
console.log(JSON.stringify({ failures, typesOnly }));
`;
    const env = { ...process.env };
    delete env.NODE_PATH;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: consumer,
      env,
      encoding: 'utf8',
      timeout: 120_000,
    });
    expect(run.status, run.stderr).toBe(0);
    const result = JSON.parse(run.stdout.trim().split('\n').at(-1) ?? '{}') as {
      failures: [string, string][];
      typesOnly: string[];
    };
    expect(result.failures).toEqual([]);
    // Types-only entries (the views engine root and reserved subpaths) import as empty
    // modules; their declarations must still export something.
    for (const specifier of result.typesOnly) {
      const [, , sub] = specifier.split('/');
      const dts = join(
        ROOT,
        'packages',
        specifier.split('/')[1] as string,
        'dist',
        sub ? `${sub}/index.d.ts` : 'index.d.ts'
      );
      expect(readFileSync(dts, 'utf8'), specifier).toMatch(/export /);
    }
    expect(result.typesOnly.length).toBeLessThan(specifiers.length / 4);
  });
});
