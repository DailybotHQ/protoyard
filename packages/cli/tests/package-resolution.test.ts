// @vitest-environment node
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { CliError } from '../src/lib/output.ts';
import {
  findInstalledPackage,
  packageExportFile,
  protoyardPackageDir,
  requireProtoyardPackage,
  workspacePackageVersion,
} from '../src/lib/workspace.ts';
import { scenariosEntry } from '../src/runners/inspect-prototype.ts';
import { cli } from './helpers.ts';

/**
 * Protoyard packages are found the way Node finds them (node_modules above
 * the prototype or the root), with this repository's packages/<name> as the
 * last resort: the scenarios SDK for the inspect runner, the blueprint
 * schema for `blueprint new`, and build provenance versions. NODE_PATH, which
 * `pnpm vitest` points at the hoisted store, is ignored on purpose.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function write(path: string, content: string | object) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`
  );
}

function temp(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(dir);
  return dir;
}

const SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'fixture blueprint',
};

/** This repository's shape: pnpm-workspace.yaml and packages/<name> sources. */
function monorepo(): string {
  const root = temp('protoyard-resolve-mono-');
  write(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n  - prototypes/*\n');
  write(join(root, 'package.json'), { name: 'fixture-monorepo', private: true });
  write(join(root, 'packages', 'core', 'package.json'), {
    name: '@protoyard/core',
    version: '9.0.0',
  });
  write(join(root, 'packages', 'blueprint', 'package.json'), {
    name: '@protoyard/blueprint',
    version: '9.0.0',
    exports: { '.': './src/index.ts', './schema.json': './schema/blueprint.schema.json' },
  });
  write(join(root, 'packages', 'blueprint', 'schema', 'blueprint.schema.json'), SCHEMA);
  write(join(root, 'packages', 'scenarios', 'package.json'), {
    name: '@protoyard/scenarios',
    version: '9.0.0',
    exports: { '.': './src/index.ts' },
  });
  write(join(root, 'packages', 'scenarios', 'src', 'index.ts'), 'export {};\n');
  mkdirSync(join(root, 'prototypes', 'demo'), { recursive: true });
  return root;
}

/**
 * A consumer workspace installed from npm: publish-shaped packages (dist
 * only, `import`-only exports, no ./package.json export). renderer-svelte is
 * installed only under the prototype, pnpm style (a symlink into a store).
 */
function consumer(): { root: string; prototype: string } {
  const root = temp('protoyard-resolve-consumer-');
  write(join(root, 'package.json'), {
    name: 'acme-lab',
    private: true,
    protoyard: { workspace: 1 },
  });
  const modules = join(root, 'node_modules', '@protoyard');
  const published = (name: string, version: string, exportsMap: object) =>
    write(join(modules, name, 'package.json'), {
      name: `@protoyard/${name}`,
      version,
      type: 'module',
      exports: exportsMap,
    });
  published('core', '1.2.3', { '.': { types: './dist/index.d.ts', import: './dist/index.js' } });
  published('runtime', '1.2.3', { '.': { import: './dist/index.js' } });
  published('blueprint', '1.2.3', {
    '.': { import: './dist/index.js', default: './dist/index.js' },
    './schema.json': './dist/schema/blueprint.schema.json',
  });
  write(join(modules, 'blueprint', 'dist', 'schema', 'blueprint.schema.json'), SCHEMA);
  published('scenarios', '1.2.3', {
    '.': { types: './dist/index.d.ts', import: './dist/index.js' },
  });
  write(join(modules, 'scenarios', 'dist', 'index.js'), 'export {};\n');
  const prototype = join(root, 'prototypes', 'demo');
  const store = join(
    root,
    'node_modules',
    '.pnpm',
    '@protoyard+renderer-svelte@1.2.4',
    'node_modules',
    '@protoyard',
    'renderer-svelte'
  );
  write(join(store, 'package.json'), { name: '@protoyard/renderer-svelte', version: '1.2.4' });
  mkdirSync(join(prototype, 'node_modules', '@protoyard'), { recursive: true });
  symlinkSync(store, join(prototype, 'node_modules', '@protoyard', 'renderer-svelte'), 'dir');
  write(join(prototype, 'package.json'), { name: '@prototype/demo', private: true });
  return { root, prototype };
}

describe('findInstalledPackage', () => {
  it('walks up to the nearest node_modules copy, following symlinks', () => {
    const { root, prototype } = consumer();
    expect(findInstalledPackage('@protoyard/core', join(prototype, 'src'))).toBe(
      join(root, 'node_modules', '@protoyard', 'core')
    );
    expect(findInstalledPackage('@protoyard/renderer-svelte', prototype)).toBe(
      join(prototype, 'node_modules', '@protoyard', 'renderer-svelte')
    );
  });

  it('ignores a folder whose manifest names another package, and NODE_PATH', () => {
    const { root } = consumer();
    write(join(root, 'node_modules', '@protoyard', 'views', 'package.json'), { name: 'not-views' });
    expect(findInstalledPackage('@protoyard/views', root)).toBeNull();
    // `pnpm vitest` sets NODE_PATH to the repository's hoisted store, where
    // @protoyard/ui exists; the fixture has none, so it must stay missing.
    expect(process.env.NODE_PATH ?? '').not.toBe('');
    expect(findInstalledPackage('@protoyard/ui', root)).toBeNull();
  });
});

describe('workspacePackageVersion (build provenance)', () => {
  it('reads installed versions, preferring the prototype over the root', () => {
    const { root, prototype } = consumer();
    expect(workspacePackageVersion(root, 'core', [prototype])).toBe('1.2.3');
    expect(workspacePackageVersion(root, 'renderer-svelte', [prototype])).toBe('1.2.4');
    // From the root alone, the prototype-only package is not visible.
    expect(workspacePackageVersion(root, 'renderer-svelte')).toBeNull();
  });

  it("falls back to this repository's packages/<name> and is null when absent", () => {
    const root = monorepo();
    expect(workspacePackageVersion(root, 'core', [join(root, 'prototypes', 'demo')])).toBe('9.0.0');
    expect(workspacePackageVersion(root, 'runtime')).toBeNull();
  });

  it('matches the real repository', () => {
    const core = JSON.parse(readFileSync(join(REPO, 'packages', 'core', 'package.json'), 'utf8'));
    expect(workspacePackageVersion(REPO, 'core', [join(REPO, 'prototypes', 'crm-demo')])).toBe(
      core.version
    );
    expect(
      workspacePackageVersion(REPO, 'renderer-svelte', [join(REPO, 'prototypes', 'crm-demo')])
    ).toBe(core.version);
  });
});

describe('requireProtoyardPackage', () => {
  it('returns the folder, or a not_found CliError with the install hint', () => {
    const { root } = consumer();
    expect(requireProtoyardPackage(root, 'core')).toBe(
      join(root, 'node_modules', '@protoyard', 'core')
    );
    try {
      requireProtoyardPackage(root, 'views');
      throw new Error('expected a CliError');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('not_found');
      expect((error as CliError).message).toBe(
        '@protoyard/views is not installed in this workspace.'
      );
      expect((error as CliError).hint).toMatch(/pnpm install/);
    }
  });
});

describe('packageExportFile', () => {
  it('resolves string and condition exports and refuses missing or escaping targets', () => {
    const dir = join(temp('protoyard-exports-'), 'pkg');
    write(join(dir, 'package.json'), {
      name: 'pkg',
      exports: {
        './a.json': './a.json',
        './b': { types: './b.d.ts', import: './b.js' },
        './gone': './gone.js',
        './up': '../outside.js',
        './abs': '/etc/hosts',
      },
    });
    write(join(dir, 'a.json'), '{}');
    write(join(dir, 'b.js'), '');
    write(join(dir, '..', 'outside.js'), '');
    expect(packageExportFile(dir, './a.json')).toBe(join(dir, 'a.json'));
    expect(packageExportFile(dir, './b')).toBe(join(dir, 'b.js'));
    expect(packageExportFile(dir, './gone')).toBeNull();
    expect(packageExportFile(dir, './up')).toBeNull();
    expect(packageExportFile(dir, './abs')).toBeNull();
    expect(packageExportFile(dir, './none')).toBeNull();
  });

  it("finds this repository's blueprint schema through @protoyard/blueprint's export", () => {
    const dir = protoyardPackageDir(REPO, 'blueprint');
    expect(dir).not.toBeNull();
    expect(realpathSync(packageExportFile(dir ?? '', './schema.json') ?? '')).toBe(
      realpathSync(join(REPO, 'packages', 'blueprint', 'schema', 'blueprint.schema.json'))
    );
    const manifest = JSON.parse(
      readFileSync(join(REPO, 'packages', 'blueprint', 'package.json'), 'utf8')
    );
    expect(manifest.publishConfig.exports['./schema.json']).toBe(
      './dist/schema/blueprint.schema.json'
    );
    expect(manifest.protoyard.build.assets).toContain('schema/blueprint.schema.json');
  });
});

describe('scenariosEntry (inspect runner)', () => {
  it('finds a packed, import-only @protoyard/scenarios from the prototype', () => {
    const { root, prototype } = consumer();
    expect(scenariosEntry(prototype, root)).toBe(
      join(root, 'node_modules', '@protoyard', 'scenarios', 'dist', 'index.js')
    );
  });

  it("falls back to this repository's packages/scenarios and is null when absent", () => {
    const root = monorepo();
    expect(scenariosEntry(join(root, 'prototypes', 'demo'), root)).toBe(
      join(root, 'packages', 'scenarios', 'src', 'index.ts')
    );
    const empty = temp('protoyard-resolve-empty-');
    write(join(empty, 'package.json'), { name: 'empty', protoyard: {} });
    expect(scenariosEntry(empty, empty)).toBeNull();
  });

  it('resolves the real repository entry for a prototype', () => {
    expect(resolve(scenariosEntry(join(REPO, 'prototypes', 'crm-demo'), REPO) ?? '')).toMatch(
      /scenarios[/\\]src[/\\]index\.ts$/
    );
  });
});

describe('blueprint new $schema in both layouts', () => {
  const BRIEF = 'A booking tool for a small salon. Clients book appointments with stylists.\n';

  async function schemaOf(root: string, file: string): Promise<string | undefined> {
    write(join(root, 'brief.md'), BRIEF);
    const run = await cli([
      '--root',
      root,
      '--json',
      'blueprint',
      'new',
      // Absolute: relative paths resolve against the process cwd, not --root.
      join(root, file),
      '--from-brief',
      join(root, 'brief.md'),
    ]);
    expect(run.code, run.stdout + run.stderr).toBe(0);
    return (JSON.parse(readFileSync(join(root, file), 'utf8')) as { $schema?: string }).$schema;
  }

  it('points at the installed package dist schema in a consumer workspace', async () => {
    const { root } = consumer();
    const ref = await schemaOf(root, 'blueprints/salon.json');
    expect(ref).toBe('../node_modules/@protoyard/blueprint/dist/schema/blueprint.schema.json');
    expect(JSON.parse(readFileSync(resolve(root, 'blueprints', ref ?? ''), 'utf8')).title).toBe(
      'fixture blueprint'
    );
  });

  it("points at this repository's schema file in a monorepo", async () => {
    const root = monorepo();
    expect(await schemaOf(root, 'blueprints/salon.json')).toBe(
      '../packages/blueprint/schema/blueprint.schema.json'
    );
  });

  it('omits $schema when the blueprint package is not installed', async () => {
    const root = temp('protoyard-resolve-noschema-');
    write(join(root, 'package.json'), { name: 'bare', private: true, protoyard: { workspace: 1 } });
    expect(await schemaOf(root, 'salon.json')).toBeUndefined();
  });
});
