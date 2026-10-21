// @vitest-environment node
import {
  cpSync,
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
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { CliError } from '../src/lib/output.ts';
import { QUICK_PLAYER_DIR } from '../src/lib/quick/paths.ts';
import {
  createPlayerAssetsManifest,
  locatePlayerAssets,
  materializePlayer,
  PLAYER_ASSETS_MANIFEST,
  PlayerAssetsManifestSchema,
  playerTargetDir,
  readPlayerAssetsManifest,
  verifyPlayerAssets,
} from '../src/lib/quick/player-assets.ts';

/**
 * The prebuilt player for `protoyard quick`: located (CLI dependency,
 * workspace install, or this repository), verified file by file against its
 * shipped sha256 manifest, and copied, never built, into an exploration or a
 * shared per-version folder. A tampered file is refused.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
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

describe('the player asset manifest', () => {
  it('lists every file but itself, sorted, with size and sha256', async () => {
    const app = await playerPackage(join(temp(), 'player'));
    const manifest = readPlayerAssetsManifest(app);
    expect(manifest.format).toBe('protoyard.player-assets');
    expect(manifest.player).toBe('1.0.0');
    expect(manifest.files.map((f) => f.path)).toEqual([
      'assets/index-abc.css',
      'assets/index-abc.js',
      'index.html',
      'sw.js',
    ]);
    expect(manifest.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256) && f.size > 0)).toBe(true);
  });

  it('refuses links in a build and unsafe or incomplete manifests', async () => {
    const app = await playerPackage(join(temp(), 'player'), { manifest: false });
    symlinkSync(join(app, 'index.html'), join(app, 'linked.html'));
    await expect(createPlayerAssetsManifest(app, '1.0.0')).rejects.toThrow(
      /links or special files/
    );
    const base = { format: 'protoyard.player-assets', version: 1, player: '1.0.0' };
    const file = (path: string) => ({ path, size: 1, sha256: 'a'.repeat(64) });
    for (const files of [
      [file('index.html'), file('../escape.js')],
      [file('index.html'), file('/etc/hosts')],
      [file('index.html'), file('a\\b.js')],
      [file('index.html'), file('index.html')],
      [file('app.js')],
    ]) {
      expect(
        PlayerAssetsManifestSchema.safeParse({ ...base, files }).success,
        JSON.stringify(files)
      ).toBe(false);
    }
    write(join(app, PLAYER_ASSETS_MANIFEST), '{nope');
    expect(() => readPlayerAssetsManifest(app)).toThrow(CliError);
  });
});

describe('locatePlayerAssets', () => {
  it("prefers the CLI's own installed player", async () => {
    const installed = join(temp(), 'node_modules', '@protoyard', 'player');
    const app = await playerPackage(installed);
    const assets = locatePlayerAssets({ workspaceRoot: null, resolveInstalled: () => installed });
    expect(assets).toMatchObject({
      dir: app,
      packageDir: installed,
      version: '1.0.0',
      source: 'installed',
    });
  });

  it("finds the workspace's install, then this repository's packages/player", async () => {
    const consumer = temp();
    write(join(consumer, 'package.json'), { name: 'acme', protoyard: { workspace: 1 } });
    const installed = join(consumer, 'node_modules', '@protoyard', 'player');
    await playerPackage(installed);
    expect(
      locatePlayerAssets({ workspaceRoot: consumer, resolveInstalled: () => null }).source
    ).toBe('workspace');

    const mono = temp();
    write(join(mono, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    // A build from before the app moved to dist/app/ is still accepted.
    const app = await playerPackage(join(mono, 'packages', 'player'), { appDir: 'dist' });
    const assets = locatePlayerAssets({ workspaceRoot: mono, resolveInstalled: () => null });
    expect(assets).toMatchObject({ source: 'repository', dir: app });
  });

  it('says how to fix an unbuilt, unmanifested or mismatched player', async () => {
    const none = temp();
    expect(() => locatePlayerAssets({ workspaceRoot: none, resolveInstalled: () => null })).toThrow(
      /No prebuilt @protoyard\/player/
    );
    const unbuilt = join(temp(), 'player');
    await playerPackage(unbuilt, { manifest: false });
    try {
      locatePlayerAssets({ workspaceRoot: null, resolveInstalled: () => unbuilt });
      throw new Error('expected a CliError');
    } catch (error) {
      expect((error as CliError).code).toBe('not_found');
      expect((error as CliError).message).toContain(PLAYER_ASSETS_MANIFEST);
      expect((error as CliError).hint).toMatch(/Rebuild/);
    }
    const mismatched = join(temp(), 'player');
    const app = await playerPackage(mismatched);
    await createPlayerAssetsManifest(app, '0.9.0');
    expect(() =>
      locatePlayerAssets({ workspaceRoot: null, resolveInstalled: () => mismatched })
    ).toThrow(/is 0\.9\.0, but its package is 1\.0\.0/);
  });
});

describe('verifyPlayerAssets', () => {
  async function verified() {
    const dir = join(temp(), 'player');
    const app = await playerPackage(dir);
    return { app, manifest: readPlayerAssetsManifest(app) };
  }

  it('passes an untouched build', async () => {
    const { app, manifest } = await verified();
    await expect(verifyPlayerAssets(app, manifest)).resolves.toBeUndefined();
  });

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

  it('copies the verified player into the shared per-version folder, then reuses it', async () => {
    const assets = await located();
    const zone = join(temp(), '.protoyard', 'quick');
    const first = await materializePlayer(assets, { kind: 'shared', zone });
    expect(first).toMatchObject({
      dir: join(zone, QUICK_PLAYER_DIR, '1.0.0'),
      reused: false,
      repaired: false,
      files: 4,
    });
    for (const file of assets.manifest.files) {
      expect(
        readFileSync(join(first.dir, file.path)).equals(readFileSync(join(assets.dir, file.path))),
        file.path
      ).toBe(true);
    }
    expect(existsSync(join(first.dir, PLAYER_ASSETS_MANIFEST))).toBe(true);
    const second = await materializePlayer(assets, { kind: 'shared', zone });
    expect(second).toMatchObject({ reused: true, repaired: false });
    expect(readdirSync(join(zone, QUICK_PLAYER_DIR))).toEqual(['1.0.0']);
  });

  it('copies into an exploration, and repairs a tampered copy from the verified source', async () => {
    const assets = await located();
    const exploration = join(temp(), 'idea');
    mkdirSync(exploration);
    const done = await materializePlayer(assets, { kind: 'exploration', dir: exploration });
    expect(done.dir).toBe(join(exploration, 'player'));
    writeFileSync(join(done.dir, 'index.html'), '<script>alert(1)</script>');
    const repaired = await materializePlayer(assets, { kind: 'exploration', dir: exploration });
    expect(repaired).toMatchObject({ reused: false, repaired: true });
    expect(readFileSync(join(done.dir, 'index.html'), 'utf8')).toContain('<title>Player</title>');
    expect(readdirSync(exploration)).toEqual(['player']);
  });

  it('refuses a tampered source and writes nothing', async () => {
    const assets = await located();
    writeFileSync(join(assets.dir, 'sw.js'), 'self.addEventListener("fetch",()=>steal());');
    const zone = join(temp(), '.protoyard', 'quick');
    await expect(materializePlayer(assets, { kind: 'shared', zone })).rejects.toThrow(
      /sw\.js: changed/
    );
    expect(existsSync(join(zone, QUICK_PLAYER_DIR))).toBe(false);
  });

  it('refuses a version that is not semver as a folder name', () => {
    expect(() => playerTargetDir({ kind: 'shared', zone: temp() }, '../1.0.0')).toThrow(
      /Refusing player version/
    );
  });

  it('never builds or installs anything', () => {
    const source = readFileSync(
      join(REPO, 'packages', 'cli', 'src', 'lib', 'quick', 'player-assets.ts'),
      'utf8'
    );
    // No process is started: no child_process import, no spawn/exec call.
    expect(source).not.toMatch(/from 'node:child_process'|from 'child_process'/);
    expect(source).not.toMatch(/\b(?:spawn|spawnSync|exec|execSync|execFile|fork)\(/);
  });
});

const realDist = join(REPO, 'packages', 'player', 'dist');
const built = existsSync(join(realDist, 'index.html'));

describe.skipIf(!built)(
  'the real player build (after pnpm --filter @protoyard/player build)',
  () => {
    it('manifests, verifies and materializes the real bundle', async () => {
      // A copy: the test never writes into the repository's build.
      const pkg = join(temp(), 'player');
      const version = JSON.parse(
        readFileSync(join(REPO, 'packages', 'player', 'package.json'), 'utf8')
      ).version;
      write(join(pkg, 'package.json'), { name: '@protoyard/player', version });
      cpSync(realDist, join(pkg, 'dist', 'app'), {
        recursive: true,
        filter: (src) => !src.includes(`${join(realDist, '.vite')}`),
      });
      const manifest = await createPlayerAssetsManifest(join(pkg, 'dist', 'app'), version);
      expect(manifest.files.length).toBeGreaterThan(50);
      const assets = locatePlayerAssets({ workspaceRoot: null, resolveInstalled: () => pkg });
      const out = await materializePlayer(assets, { kind: 'shared', zone: join(temp(), 'zone') });
      expect(existsSync(join(out.dir, 'index.html'))).toBe(true);
      expect(out.files).toBe(manifest.files.length);
    }, 120_000);
  }
);
