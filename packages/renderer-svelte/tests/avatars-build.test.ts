// @vitest-environment node
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build, createServer, type InlineConfig } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { avatarAssetsDir, listAvatarFiles, protoyardAvatars } from '../src/avatars-plugin.ts';
import { defineProtoyardConfig } from '../src/vite.ts';

/**
 * Real Vite builds of a minimal prototype through `defineProtoyardConfig`:
 * the avatar plugin must emit the library under `avatars/` with fixed names,
 * bake the right base into `avatarUrl`, and emit nothing when a shared base
 * (the showcase) or an opt-out applies.
 */

const AVATARS_SRC = resolve(import.meta.dirname, '../src/avatars.ts');
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function fixture(options: { avatars?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'protoyard-avatars-'));
  roots.push(root);
  writeFileSync(
    join(root, 'protoyard.json'),
    JSON.stringify({
      id: 'example.avatars',
      slug: 'avatars-fixture',
      name: 'Avatars fixture',
      version: '0.1.0',
      storage: { namespace: 'avatars-fixture', schemaVersion: 1 },
    })
  );
  writeFileSync(
    join(root, 'index.html'),
    '<!doctype html><html><head><title>Avatars</title></head><body><div id="app"></div><script type="module" src="./main.js"></script></body></html>'
  );
  writeFileSync(
    join(root, 'main.js'),
    `import { avatarSrcset, avatarUrl } from ${JSON.stringify(AVATARS_SRC)};\ndocument.getElementById('app').textContent = [avatarUrl('av-003', 64), avatarSrcset('av-003') ?? 'none'].join('|');\n`
  );
  const factory = defineProtoyardConfig({
    root,
    logLevel: 'silent',
    ...(options.avatars !== undefined ? { avatars: options.avatars } : {}),
  });
  return { root, factory };
}

async function buildWith(env: Record<string, string>, options: { avatars?: boolean } = {}) {
  const { root, factory } = fixture(options);
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env, { PROTOYARD_OUT_DIR: join(root, 'dist') });
  try {
    const config = factory({
      command: 'build',
      mode: 'production',
      isSsrBuild: false,
      isPreview: false,
    }) as InlineConfig;
    await build({ ...config, configFile: false });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete process.env.PROTOYARD_OUT_DIR;
  }
  const dist = join(root, 'dist');
  const js = readdirSync(join(dist, 'assets'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(dist, 'assets', name), 'utf8'))
    .join('\n');
  return { dist, js };
}

function avatarFiles(dist: string): string[] {
  const dir = join(dist, 'avatars');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${entry.parentPath.slice(dir.length + 1)}/${entry.name}`)
    .sort();
}

describe('avatar build plugin', () => {
  it('emits both sizes under avatars/ with fixed names and byte-identical content', async () => {
    const { dist, js } = await buildWith({});
    const files = avatarFiles(dist);
    expect(files).toHaveLength(350);
    expect(files[0]).toBe('128/av-001.webp');
    expect(files).toContain('64/av-175.webp');
    for (const file of listAvatarFiles([64, 128])) {
      const shipped = readFileSync(join(dist, file.fileName));
      expect(shipped.equals(readFileSync(file.source)), file.fileName).toBe(true);
    }
    // The relocatable base is baked in; no hash in the names.
    expect(js).toContain('./avatars/');
    expect(js).not.toMatch(/av-\d{3}-[A-Za-z0-9_-]{8}\.webp/);
  }, 60_000);

  it('emits nothing for a shared base and bakes that base in (the showcase)', async () => {
    const { dist, js } = await buildWith({ PROTOYARD_AVATAR_BASE: '/avatars/' });
    expect(avatarFiles(dist)).toEqual([]);
    expect(js).toContain('/avatars/');
    expect(js).not.toContain('./avatars/');
  }, 60_000);

  it('ships 128 px only when asked (the artifact target)', async () => {
    const { dist } = await buildWith({ PROTOYARD_AVATAR_SIZES: '128' });
    const files = avatarFiles(dist);
    expect(files).toHaveLength(175);
    expect(files.every((file) => file.startsWith('128/'))).toBe(true);
  }, 60_000);

  it('emits nothing when a prototype opts out', async () => {
    const { dist } = await buildWith({}, { avatars: false });
    expect(avatarFiles(dist)).toEqual([]);
  }, 60_000);

  it('serves the same avatar paths from the dev server', async () => {
    const { factory } = fixture();
    const config = factory({
      command: 'serve',
      mode: 'development',
      isSsrBuild: false,
      isPreview: false,
    }) as InlineConfig;
    const server = await createServer({
      ...config,
      configFile: false,
      server: { ...config.server, port: 0, host: '127.0.0.1' },
    });
    try {
      await server.listen();
      const url = server.resolvedUrls?.local[0] ?? '';
      const ok = await fetch(`${url}avatars/64/av-001.webp`);
      expect(ok.status).toBe(200);
      expect(ok.headers.get('content-type')).toBe('image/webp');
      const [expected] = listAvatarFiles([64]);
      expect(Buffer.from(await ok.arrayBuffer()).equals(readFileSync(expected?.source ?? ''))).toBe(
        true
      );
      for (const missing of ['avatars/64/av-176.webp', 'avatars/256/av-001.webp']) {
        const response = await fetch(`${url}${missing}`);
        expect(response.headers.get('content-type'), missing).not.toBe('image/webp');
      }
    } finally {
      await server.close();
    }
  }, 60_000);

  it('lists only library files and fails clearly when the images are missing', () => {
    expect(listAvatarFiles([64])).toHaveLength(175);
    expect(existsSync(avatarAssetsDir())).toBe(true);
    const empty = mkdtempSync(join(tmpdir(), 'protoyard-no-avatars-'));
    roots.push(empty);
    expect(() => listAvatarFiles([64], empty)).toThrow(/avatar images not found/);
    expect(protoyardAvatars({ sizes: [], emit: true }).name).toBe('protoyard:avatars');
  });
});
