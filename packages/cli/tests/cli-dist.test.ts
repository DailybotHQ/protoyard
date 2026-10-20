// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPackages } from '../../../scripts/build-packages.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CLI = join(ROOT, 'packages/cli');
const DIST = join(CLI, 'dist');

beforeAll(async () => {
  if (existsSync(join(DIST, 'bin.js'))) return;
  const build = await buildPackages({ root: ROOT, filters: ['@protoyard/cli'] });
  if (!build.ok) throw new Error(`CLI dist build failed: ${JSON.stringify(build.packages)}`);
}, 600_000);

describe('CLI JavaScript distribution', () => {
  it('runs its compiled bin with the package version and no tsx entry loader', () => {
    const entry = join(DIST, 'bin.js');
    const result = spawnSync(process.execPath, [entry, '--version', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('1.0.0');
    expect(readFileSync(entry, 'utf8')).not.toContain('tsx/');
    expect(existsSync(join(DIST, 'runners/inspect-prototype.js'))).toBe(true);
    expect(existsSync(join(DIST, 'lib/review-worker-entry.js'))).toBe(true);
    expect(readFileSync(join(DIST, 'lib/review-worker.js'), 'utf8')).toContain(
      "'./review-worker-entry.js'"
    );
  });

  it('maps packed bin and API exports to dist and keeps inspect runner paths compiled', () => {
    const manifest = JSON.parse(readFileSync(join(CLI, 'package.json'), 'utf8')) as {
      files: string[];
      publishConfig: {
        bin: Record<string, string>;
        exports: Record<string, { types: string; import: string }>;
      };
    };
    const inspectSource = readFileSync(join(CLI, 'src/lib/inspect.ts'), 'utf8');

    expect(manifest.publishConfig.bin.protoyard).toBe('./dist/bin.js');
    expect(manifest.publishConfig.exports['.']).toEqual({
      types: './dist/index.d.ts',
      import: './dist/index.js',
    });
    expect(manifest.files).toEqual(['bin', 'dist', 'ci-templates']);
    expect(inspectSource).toContain("'../runners/inspect-prototype.js'");
  });

  it('does not register tsx for Vite when the CLI runs from compiled output', () => {
    const moduleUrl = pathToFileURL(join(DIST, 'lib/vite.js')).href;
    const source = [
      `import { nodeLoaderArgs } from ${JSON.stringify(moduleUrl)};`,
      `console.log(JSON.stringify(nodeLoaderArgs(${JSON.stringify(ROOT)}, ${JSON.stringify(ROOT)})));`,
    ].join('\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual([]);
  });
});
