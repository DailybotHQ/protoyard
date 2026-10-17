// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addBuildablePrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/**
 * --offline sets PROTOYARD_OFFLINE=1 for the Vite child; the renderer config
 * then emits dist/sw.js. The fixture config stands in for that plugin and
 * writes the same `const CONFIG = {...}` line @protoyard/offline reads back.
 */
const OFFLINE_CONFIG = `export default {
  logLevel: 'silent',
  plugins: [{
    name: 'fake-offline',
    generateBundle() {
      if (process.env.PROTOYARD_OFFLINE !== '1') return;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: 'const CONFIG = {"version":"v-test","precache":["./","./index.html"]};\\n' });
    },
  }],
};
`;

let ws: TempWorkspace;
beforeAll(() => {
  ws = createWorkspace();
  addBuildablePrototype(ws, 'off-app');
  ws.write('prototypes/off-app/vite.config.ts', OFFLINE_CONFIG);
  // The reader is resolved from the workspace; point this fixture at the real package.
  ws.write(
    'packages/offline/src/index.ts',
    `export * from ${JSON.stringify(join(process.cwd(), 'packages/offline/src/index.ts'))};\n`
  );
});
afterAll(() => ws.cleanup());

const manifest = () =>
  JSON.parse(readFileSync(join(ws.root, 'artifacts/off-app/build-manifest.json'), 'utf8'));

describe('--offline', () => {
  it('records offline: false for a normal build', async () => {
    expect((await cli(['--root', ws.root, '--json', 'build', 'off-app'])).code).toBe(0);
    expect(manifest().offline).toBe(false);
  }, 60_000);

  it('sets PROTOYARD_OFFLINE=1 and records the service worker in the build manifest', async () => {
    const run = await cli(['--root', ws.root, '--json', 'build', 'off-app', '--offline']);
    expect(run.code).toBe(0);
    expect(manifest().offline).toEqual({ enabled: true, version: 'v-test', precached: 2 });
  }, 60_000);

  it('ships sw.js inside the exported ZIP', async () => {
    const run = await cli(['--root', ws.root, '--json', 'export', 'off-app', '--offline']);
    expect(run.code).toBe(0);
    const zip = unzipSync(
      new Uint8Array(readFileSync(join(ws.root, 'artifacts/off-app/off-app.zip')))
    );
    expect(Object.keys(zip)).toContain('sw.js');
  }, 60_000);

  it('fails clearly when offline is requested but no service worker was emitted', async () => {
    ws.write('prototypes/off-app/vite.config.ts', 'export default { logLevel: "silent" };\n');
    const run = await cli(['--root', ws.root, '--json', 'build', 'off-app', '--offline']);
    expect(run.code).toBe(4);
    expect(run.json<{ error: { message: string } }>().error.message).toMatch(/no service worker/);
  }, 60_000);
});
