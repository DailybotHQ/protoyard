// @vitest-environment node
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { readTarball } from '../../../scripts/check-packages.ts';
import { listTemplateFiles } from '../../cli/src/commands/new.ts';
import { parseManifest } from '../../core/src/manifest.ts';
import { listTemplates, TEMPLATES_ROOT, templateDir } from '../index.js';
import { cleanTemplates, copyTemplates, SKIP_NAMES } from '../scripts/copy-templates.mjs';

/**
 * @protoyard/templates: the repository's templates/ is the only source; the
 * package lists and resolves them, `prepack` copies them in and `postpack`
 * removes the copy, and the real tarball carries every template.
 */

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const REPO_TEMPLATES = fileURLToPath(new URL('../../../templates/', import.meta.url));
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(dir);
  return dir;
}

/** Template folders in the repository (the source of truth). */
const repoTemplates = readdirSync(REPO_TEMPLATES)
  .filter((name) => existsSync(join(REPO_TEMPLATES, name, 'protoyard.json')))
  .sort();

function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

describe('listTemplates and templateDir in the repository', () => {
  it('resolves the repository templates/ and lists every template with a valid manifest', () => {
    expect(realpathSync(TEMPLATES_ROOT)).toBe(realpathSync(REPO_TEMPLATES));
    const templates = listTemplates();
    expect(templates.map((t) => t.name)).toEqual(repoTemplates);
    expect(templates).toHaveLength(repoTemplates.length);
    for (const t of templates) {
      expect(() => parseManifest(t.manifest), t.name).not.toThrow();
      expect(t.dir).toBe(join(TEMPLATES_ROOT, t.name));
    }
  });

  it('resolves a template folder and refuses non-slugs and unknown names', () => {
    expect(templateDir('blank')).toBe(join(TEMPLATES_ROOT, 'blank'));
    for (const bad of ['../blank', 'blank/src', 'Blank', '', '.']) {
      expect(() => templateDir(bad), bad).toThrow(/not a template name/);
    }
    expect(() => templateDir('no-such-template')).toThrow(/No template "no-such-template"/);
  });

  it('skips folders without protoyard.json and reports an invalid manifest', () => {
    const root = tempDir('protoyard-templates-list-');
    write(join(root, 'good', 'protoyard.json'), '{"slug":"good"}');
    write(join(root, 'notes', 'README.md'), '# not a template');
    expect(listTemplates(root).map((t) => t.name)).toEqual(['good']);
    write(join(root, 'broken', 'protoyard.json'), '{nope');
    expect(() => listTemplates(root)).toThrow(/broken.*not valid JSON/);
  });
});

describe('copyTemplates (prepack) and cleanTemplates (postpack)', () => {
  it('skips at least what `protoyard new` skips', () => {
    for (const name of ['node_modules', 'dist', '.env', '.npmrc', 'artifacts', 'coverage']) {
      expect(SKIP_NAMES.has(name), name).toBe(true);
    }
  });

  it('copies exactly the files `protoyard new` would copy for every template', async () => {
    const destination = join(tempDir('protoyard-templates-copy-'), 'templates');
    const result = copyTemplates(REPO_TEMPLATES, destination);
    expect(result.templates).toBe(repoTemplates.length);
    let expectedFiles = 0;
    for (const name of repoTemplates) {
      const expected = (await listTemplateFiles(join(REPO_TEMPLATES, name))).filter(
        (path) => !/(^|\/)(test-results|playwright-report|blob-report)(\/|$)/.test(path)
      );
      const copied = await listTemplateFiles(join(destination, name));
      expect(copied.sort(), name).toEqual(expected.sort());
      expectedFiles += expected.length;
    }
    expect(result.files).toBe(expectedFiles);
  });

  it('copies only git-tracked files, never follows symlinks, drops secrets and build output, and cleans up', () => {
    const root = tempDir('protoyard-templates-fixture-');
    const source = join(root, 'src-templates');
    const outside = join(root, 'outside.txt');
    write(outside, 'secret');
    write(join(source, 'one', 'protoyard.json'), '{}');
    write(join(source, 'one', 'src', 'App.svelte'), '<p>one</p>');
    write(join(source, 'one', 'tests', 'one.test.ts'), 'export {};');
    write(join(source, 'one', '.env.local'), 'TOKEN=x');
    write(join(source, 'one', '.env.example'), 'TOKEN=');
    write(join(source, 'one', 'node_modules', 'x', 'index.js'), '');
    write(join(source, 'one', 'dist', 'index.html'), '');
    write(join(source, 'one', 'test-results', 'r.json'), '{}');
    symlinkSync(outside, join(source, 'one', 'link.txt'));
    write(join(source, 'not-a-template', 'README.md'), '#');
    const git = (...args: string[]) => {
      const run = spawnSync('git', ['-C', source, ...args], { encoding: 'utf8' });
      expect(run.status, run.stderr).toBe(0);
    };
    git('init', '--quiet');
    git('add', '--all', '--force');
    // Untracked: a local file in a checkout never ships.
    write(join(source, 'one', 'src', 'Local.svelte'), '<p>local</p>');

    const destination = join(root, 'packed');
    expect(copyTemplates(source, destination)).toEqual({ templates: 1, files: 4 });
    expect(readdirSync(destination)).toEqual(['one']);
    expect(readdirSync(join(destination, 'one')).sort()).toEqual([
      '.env.example',
      'protoyard.json',
      'src',
      'tests',
    ]);
    expect(readdirSync(join(destination, 'one', 'src'))).toEqual(['App.svelte']);
    cleanTemplates(destination);
    expect(existsSync(destination)).toBe(false);
  });

  it('refuses a source outside any git checkout', () => {
    const source = join(tempDir('protoyard-templates-nogit-'), 'templates');
    write(join(source, 'one', 'protoyard.json'), '{}');
    expect(() => copyTemplates(source, join(source, '..', 'packed'))).toThrow(
      /git-tracked files only/
    );
  });
});

describe('the packed tarball', () => {
  it('carries every repository template with valid manifests and leaves no copy behind', async () => {
    const destination = tempDir('protoyard-templates-pack-');
    const result = spawnSync('pnpm', ['pack', '--pack-destination', destination, '--json'], {
      cwd: PACKAGE_DIR,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    const tarballPath = join(destination, 'protoyard-templates-1.0.0.tgz');
    expect(existsSync(tarballPath)).toBe(true);
    // postpack removed the copy: nothing lingers in the repository.
    expect(existsSync(join(PACKAGE_DIR, 'templates'))).toBe(false);

    const tarball = new Uint8Array(readFileSync(tarballPath));
    expect(tarball.byteLength).toBeLessThan(5 * 1024 * 1024);
    const files = readTarball(tarball);
    for (const path of ['package.json', 'index.js', 'index.d.ts', 'README.md']) {
      expect(files.has(path), path).toBe(true);
    }
    const packed = [...files.keys()];
    expect(packed.filter((p) => /(^|\/)(node_modules|dist)\//.test(p))).toEqual([]);
    expect(packed.filter((p) => !/^(templates\/|[^/]+$)/.test(p))).toEqual([]);

    const names = [
      ...new Set(
        packed.filter((p) => p.endsWith('/protoyard.json')).map((p) => p.split('/')[1] ?? '')
      ),
    ].sort();
    expect(names).toEqual(repoTemplates);
    for (const name of names) {
      const manifest = JSON.parse(
        new TextDecoder().decode(files.get(`templates/${name}/protoyard.json`))
      ) as unknown;
      expect(() => parseManifest(manifest), name).not.toThrow();
    }

    // Installed from the tarball, the index resolves the packed copy.
    const installed = join(tempDir('protoyard-templates-installed-'), 'package');
    for (const [path, data] of files) {
      mkdirSync(dirname(join(installed, path)), { recursive: true });
      writeFileSync(join(installed, path), data);
    }
    const mod = (await import(pathToFileURL(join(installed, 'index.js')).href)) as {
      TEMPLATES_ROOT: string;
      listTemplates(): { name: string }[];
    };
    expect(mod.TEMPLATES_ROOT).toBe(join(installed, 'templates'));
    expect(mod.listTemplates().map((t) => t.name)).toEqual(repoTemplates);
  }, 180_000);
});
