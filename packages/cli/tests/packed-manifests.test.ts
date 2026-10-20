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
    sideEffects?: string[] | false;
  };
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
