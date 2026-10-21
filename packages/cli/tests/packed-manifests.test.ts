// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildPackages } from '../../../scripts/build-packages.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

type ExportTarget = string | Record<string, string>;
interface Manifest {
  name: string;
  version: string;
  exports?: Record<string, ExportTarget>;
  files?: string[];
  publishConfig?: {
    access?: string;
    provenance?: boolean;
    exports?: Record<string, ExportTarget>;
    types?: string;
    svelte?: string;
    files?: string[];
    sideEffects?: string[] | false;
  };
  svelte?: string;
  sideEffects?: string[] | false;
  peerDependencies?: Record<string, string>;
  protoyard?: { build?: { group?: string } };
}

function readPackage(folder: string): Manifest {
  return JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as Manifest;
}

function unpackedManifest(archive: string): Manifest {
  const contents = execFileSync('tar', ['-xOf', archive, 'package/package.json'], {
    encoding: 'utf8',
  });
  return JSON.parse(contents) as Manifest;
}

function targets(exportValue: ExportTarget): string[] {
  return typeof exportValue === 'string' ? [exportValue] : Object.values(exportValue);
}

describe('packed engine manifests', () => {
  it('uses dist exports after pnpm pack for every engine package', async () => {
    const built = await buildPackages({ root: ROOT, filters: ['engine'] });
    expect(built.ok, JSON.stringify(built.packages.filter((item) => item.status !== 'built'))).toBe(
      true
    );

    const engineFolders = built.packages
      .filter((item) => readPackage(item.directory).protoyard?.build?.group === 'engine')
      .map((item) => item.directory);
    expect(engineFolders.length).toBe(16);
    const destination = mkdtempSync(join(tmpdir(), 'protoyard-engine-packs-'));
    try {
      for (const folder of engineFolders) {
        const source = readPackage(folder);
        const configured = source.publishConfig;
        expect(configured?.access, source.name).toBe('public');
        expect(configured?.provenance, source.name).toBe(true);
        expect(source.files, source.name).toContain('dist');
        expect(source.files, source.name).toContain('README.md');
        expect(source.files, source.name).toContain('LICENSE');
        expect(configured?.exports, source.name).toEqual(
          expect.objectContaining(
            Object.fromEntries(
              Object.keys(source.exports ?? {}).map((key) => [key, expect.anything()])
            )
          )
        );
        for (const [key, exportValue] of Object.entries(configured?.exports ?? {})) {
          for (const target of targets(exportValue)) {
            expect(target, `${source.name} ${key}`).toMatch(/^\.\/(?:dist|assets|types)\//);
          }
        }
        const rootTarget = configured?.exports?.['.'];
        if (rootTarget && typeof rootTarget !== 'string') {
          expect(rootTarget.default, `${source.name} default condition`).toBeDefined();
        }

        execFileSync('pnpm', ['pack', '--pack-destination', destination], {
          cwd: folder,
          stdio: 'pipe',
        });
      }

      const archives = readdirSync(destination).filter((name) => name.endsWith('.tgz'));
      expect(archives).toHaveLength(engineFolders.length);
      for (const archive of archives) {
        const packed = unpackedManifest(join(destination, archive));
        const source = engineFolders.map(readPackage).find((item) => item.name === packed.name);
        expect(source, packed.name).toBeDefined();
        expect(packed.exports, packed.name).toEqual(source?.publishConfig?.exports);
      }
    } finally {
      rmSync(destination, { recursive: true, force: true });
    }
  }, 600_000);
});

describe('packed svelte manifests', () => {
  it('uses typed dist exports after pnpm pack for every Svelte package', async () => {
    const built = await buildPackages({ root: ROOT, filters: ['svelte'] });
    expect(built.ok, JSON.stringify(built.packages.filter((item) => item.status !== 'built'))).toBe(
      true
    );

    const svelteFolders = built.packages
      .filter((item) => readPackage(item.directory).peerDependencies?.svelte)
      .map((item) => item.directory);
    expect(svelteFolders.length).toBe(10);
    const destination = mkdtempSync(join(tmpdir(), 'protoyard-svelte-packs-'));
    try {
      for (const folder of svelteFolders) {
        const source = readPackage(folder);
        const configured = source.publishConfig;
        expect(configured?.access, source.name).toBe('public');
        expect(configured?.provenance, source.name).toBe(true);
        expect(source.peerDependencies?.svelte, source.name).toMatch(/^\^5\./);
        expect(configured?.files, source.name).toEqual(['dist', 'README.md', 'LICENSE']);
        expect(source.sideEffects, source.name).toContain('dist/**/*.css');
        expect(configured?.exports, source.name).toEqual(
          expect.objectContaining(
            Object.fromEntries(
              Object.keys(source.exports ?? {}).map((key) => [key, expect.anything()])
            )
          )
        );
        expect(Object.keys(configured?.exports ?? {}), source.name).toEqual(
          Object.keys(source.exports ?? {})
        );
        for (const [key, exportValue] of Object.entries(configured?.exports ?? {})) {
          expect(typeof exportValue, `${source.name} ${key}`).toBe('object');
          if (typeof exportValue === 'string') continue;
          expect(exportValue.types, `${source.name} ${key} types`).toBeDefined();
          expect(exportValue.svelte, `${source.name} ${key} svelte`).toBeDefined();
          expect(exportValue.default, `${source.name} ${key} default`).toBeDefined();
          for (const target of Object.values(exportValue)) {
            expect(target, `${source.name} ${key}`).toMatch(/^\.\/dist\//);
          }
        }
        const rootTarget = configured?.exports?.['.'];
        if (rootTarget && typeof rootTarget !== 'string') {
          expect(configured?.types, `${source.name} package types`).toBe(rootTarget.types);
          expect(rootTarget.svelte, `${source.name} svelte export condition`).toBeDefined();
          expect(source.svelte, `${source.name} legacy svelte field`).toBeUndefined();
        }

        execFileSync('pnpm', ['pack', '--pack-destination', destination], {
          cwd: folder,
          stdio: 'pipe',
        });
      }

      const archives = readdirSync(destination).filter((name) => name.endsWith('.tgz'));
      expect(archives).toHaveLength(svelteFolders.length);
      for (const archive of archives) {
        const packed = unpackedManifest(join(destination, archive));
        const source = svelteFolders.map(readPackage).find((item) => item.name === packed.name);
        expect(source, packed.name).toBeDefined();
        expect(packed.exports, packed.name).toEqual(source?.publishConfig?.exports);
        expect(packed.types, packed.name).toBe(source?.publishConfig?.types);
        expect(packed.svelte, packed.name).toBeUndefined();
        expect(packed.sideEffects, packed.name).toEqual(source?.sideEffects);
      }
    } finally {
      rmSync(destination, { recursive: true, force: true });
    }
  }, 600_000);
});
