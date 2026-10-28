// @vitest-environment node
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build, createServer, type InlineConfig } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { defineProtoyardConfig } from '../src/vite.ts';

/**
 * Texuli from npm, through the real prototype Vite config
 * (`defineProtoyardConfig`): the dev server serves the published Texuli
 * components, and a production build bundles a Texuli component into the
 * prototype.
 */

const ROOT = resolve(import.meta.dirname, 'fixtures/texuli-link');
const workspace = resolve(import.meta.dirname, '../../..');
// Protoyard's lane E2E ports are 4960-4969; this one is for this spec only.
const PORT = 4962;
const outDirs: string[] = [];
afterAll(() => {
  for (const dir of outDirs) rmSync(dir, { recursive: true, force: true });
});

function config(command: 'serve' | 'build'): InlineConfig {
  const factory = defineProtoyardConfig({ root: ROOT, logLevel: 'silent' });
  return {
    ...(factory({
      command,
      mode: command === 'build' ? 'production' : 'development',
      isSsrBuild: false,
      isPreview: false,
    }) as InlineConfig),
    configFile: false,
  };
}

describe('Texuli from npm in Protoyard: dev and build', () => {
  it('dev: serves the published Texuli components over /@fs', async () => {
    const server = await createServer({
      ...config('serve'),
      server: { ...config('serve').server, port: PORT, strictPort: true, host: '127.0.0.1' },
    });
    await server.listen();
    try {
      const base = `http://127.0.0.1:${PORT}`;
      const page = await fetch(`${base}/`);
      expect(page.status).toBe(200);
      const main = await fetch(`${base}/main.ts`);
      expect(main.status).toBe(200);
      const button = realpathSync(
        resolve(workspace, 'node_modules/texuli/dist/components/button/Button.svelte')
      );
      const served = await fetch(`${base}/@fs${button}`);
      expect(served.status).toBe(200);
      expect(await served.text()).toContain('tx-button');
    } finally {
      await server.close();
    }
  }, 120_000);

  it('build: bundles the Texuli Button into the prototype', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'protoyard-texuli-build-'));
    outDirs.push(outDir);
    const saved = process.env.PROTOYARD_OUT_DIR;
    process.env.PROTOYARD_OUT_DIR = outDir;
    try {
      await build(config('build'));
    } finally {
      if (saved === undefined) delete process.env.PROTOYARD_OUT_DIR;
      else process.env.PROTOYARD_OUT_DIR = saved;
    }
    expect(existsSync(join(outDir, 'index.html'))).toBe(true);
    const assets = join(outDir, 'assets');
    const js = readdirSync(assets)
      .filter((file) => file.endsWith('.js'))
      .map((file) => readFileSync(join(assets, file), 'utf8'))
      .join('\n');
    expect(js).toContain('tx-button');
    expect(js).toContain('Save draft');
  }, 180_000);
});
