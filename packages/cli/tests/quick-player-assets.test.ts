// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CliError } from '../src/lib/output.ts';
import { QUICK_PLAYER_DIR } from '../src/lib/quick/paths.ts';
import {
  createPlayerAssetsManifest,
  locatePlayerAssets,
  materializePlayer,
  readPlayerAssetsManifest,
  verifyPlayerAssets,
} from '../src/lib/quick/player-assets.ts';

/**
 * The prebuilt player for `protoyard quick`: located (CLI dependency,
 * workspace install, or this repository), verified file by file against its
 * shipped sha256 manifest, and copied, never built, into an exploration or a
 * shared per-version folder. A tampered file is refused.
 */

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function temp(prefix = 'protoyard-player-assets-'): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(dir);
  return dir;
}

function write(path: string, content: string | object) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`
  );
}

/** A built @protoyard/player package folder with its app under `appDir`. */
async function playerPackage(
  dir: string,
  options: { version?: string; appDir?: string; manifest?: boolean } = {}
): Promise<string> {
  const version = options.version ?? '1.0.0';
  write(join(dir, 'package.json'), {
    name: '@protoyard/player',
    version,
    exports: { './embed': './dist/embed/index.js' },
  });
  const app = join(dir, ...(options.appDir ?? 'dist/app').split('/'));
  write(join(app, 'index.html'), '<!doctype html><title>Player</title>');
  write(join(app, 'assets', 'index-abc.js'), 'console.log("player");');
  write(join(app, 'assets', 'index-abc.css'), 'body{margin:0}');
  write(join(app, 'sw.js'), 'self.addEventListener("fetch",()=>{});');
  if (options.manifest !== false) await createPlayerAssetsManifest(app, version);
  return app;
}

describe('verifyPlayerAssets', () => {
  async function verified() {
    const dir = join(temp(), 'player');
    const app = await playerPackage(dir);
    return { app, manifest: readPlayerAssetsManifest(app) };
  }

  it('refuses a tampered file (same size, different bytes), naming it', async () => {
    const { app, manifest } = await verified();
    const js = join(app, 'assets', 'index-abc.js');
    const original = readFileSync(js, 'utf8');
    writeFileSync(js, original.replace('player', 'pwned!'));
    expect(readFileSync(js).length).toBe(Buffer.byteLength(original));
    await expect(verifyPlayerAssets(app, manifest)).rejects.toThrow(
      /assets\/index-abc\.js: changed/
    );
  });

  it('refuses missing, unlisted and linked files', async () => {
    const { app, manifest } = await verified();
    rmSync(join(app, 'sw.js'));
    write(join(app, 'assets', 'extra.js'), 'alert(1)');
    symlinkSync('/etc/hosts', join(app, 'hosts'));
    const error = await verifyPlayerAssets(app, manifest).catch((e: unknown) => e as CliError);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('validation');
    expect((error as CliError).message).toMatch(/sw\.js: missing/);
    expect((error as CliError).message).toMatch(/assets\/extra\.js: not in the manifest/);
    expect((error as CliError).message).toMatch(/hosts: a link or special file/);
  });
});

describe('materializePlayer', () => {
  async function located() {
    const installed = join(temp(), 'node_modules', '@protoyard', 'player');
    await playerPackage(installed);
    return locatePlayerAssets({ workspaceRoot: null, resolveInstalled: () => installed });
  }

  it('refuses a tampered source and writes nothing', async () => {
    const assets = await located();
    writeFileSync(join(assets.dir, 'sw.js'), 'self.addEventListener("fetch",()=>steal());');
    const zone = join(temp(), '.protoyard', 'quick');
    await expect(materializePlayer(assets, { kind: 'shared', zone })).rejects.toThrow(
      /sw\.js: changed/
    );
    expect(existsSync(join(zone, QUICK_PLAYER_DIR))).toBe(false);
  });
});
