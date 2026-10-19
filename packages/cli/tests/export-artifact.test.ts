// @vitest-environment node
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ARTIFACT_AVATAR_SIZES, ARTIFACT_COMMENT_CAPABILITIES } from '../src/lib/artifact-pack.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/*
 * `export <slug> --target artifact` on a real Vite build in a throwaway
 * workspace: build (artifact settings), isolation, pack, refusals.
 */

let ws: TempWorkspace | undefined;
afterEach(() => {
  ws?.cleanup();
  ws = undefined;
});

interface ArtifactData {
  slug: string;
  target: string;
  dryRun: boolean;
  outDir: string;
  page: string;
  files: number;
  batches: number;
  buildSha256: string;
  includeDevtools: boolean;
  frameWhenEmbedded: boolean;
  capabilities: Record<string, unknown> | null;
  manifest: { icon: string; description: string; title: string; files: { path: string }[] };
  publish: {
    file_path: string;
    files: Record<string, string>;
    icon: string;
    description: string;
    capabilities?: Record<string, unknown>;
  }[];
}

/**
 * A prototype Vite can build. Its config bakes PROTOYARD_FRAME_WHEN_EMBEDDED
 * into the bundle (as the renderer config does into __PROTOYARD_BUILD__), so
 * the pack output shows what the build was asked for.
 */
function addSharable(
  workspace: TempWorkspace,
  slug = 'share-app',
  overrides: Record<string, unknown> = {},
  head = ''
) {
  addPrototype(workspace, slug, overrides);
  const base = `prototypes/${slug}`;
  workspace.write(`${base}/package.json`, { name: `@prototype/${slug}`, private: true });
  workspace.write(
    `${base}/vite.config.ts`,
    'export default { logLevel: "silent", define: { __FRAME__: JSON.stringify(process.env.PROTOYARD_FRAME_WHEN_EMBEDDED ?? ""), __AVATAR_SIZES__: JSON.stringify(process.env.PROTOYARD_AVATAR_SIZES ?? "") } };\n'
  );
  workspace.write(
    `${base}/index.html`,
    `<!doctype html><html><head><meta charset="UTF-8" /><title>Share App</title>${head}</head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>\n`
  );
  workspace.write(
    `${base}/src/main.ts`,
    'declare const __FRAME__: string;\ndeclare const __AVATAR_SIZES__: string;\ndocument.getElementById("app")!.textContent = "frame-when-embedded=" + __FRAME__ + " avatar-sizes=" + __AVATAR_SIZES__;\n'
  );
}

async function exportArtifact(args: string[] = [], slug = 'share-app') {
  const workspace = ws as TempWorkspace;
  return cli(['--root', workspace.root, '--json', 'export', slug, '--target', 'artifact', ...args]);
}

describe('protoyard export --target artifact', () => {
  it('builds with embedded frames, checks isolation and writes a publishable pack', async () => {
    ws = createWorkspace();
    addSharable(ws);
    const run = await exportArtifact();
    expect(run.code, run.stderr).toBe(0);
    const { data } = run.json<{ ok: boolean; data: ArtifactData }>();
    expect(data).toMatchObject({
      slug: 'share-app',
      target: 'artifact',
      dryRun: false,
      outDir: 'artifacts/share-app/artifact',
      page: 'artifacts/share-app/artifact/page.html',
      batches: 1,
      includeDevtools: true,
      frameWhenEmbedded: true,
      capabilities: null,
    });
    expect(data.buildSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(data.manifest).toMatchObject({
      icon: 'app',
      description: 'A fixture prototype.',
      title: 'Share App',
    });

    const pack = join(ws.root, data.outDir);
    const page = readFileSync(join(pack, 'page.html'), 'utf8');
    expect(page.startsWith('<title>Share App</title>')).toBe(true);
    expect(page).not.toMatch(/<html|<head|<body|charset/i);
    expect(JSON.parse(readFileSync(join(pack, 'artifact-manifest.json'), 'utf8')).buildSha256).toBe(
      data.buildSha256
    );

    // The build was asked to keep frames when embedded: the flag is in the packed bundle.
    const scripts = data.manifest.files.filter((file) => file.path.endsWith('.js'));
    expect(scripts.length).toBeGreaterThan(0);
    const bundle = scripts.map((file) => readFileSync(join(pack, file.path), 'utf8')).join('\n');
    expect(bundle).toContain('frame-when-embedded=1');
    // Artifact builds ship 128 px avatars only (half the files; see ARTIFACT_AVATAR_SIZES).
    expect(bundle).toContain('avatar-sizes=128');
    expect(ARTIFACT_AVATAR_SIZES).toEqual([128]);
    const record = JSON.parse(
      readFileSync(join(ws.root, 'artifacts/share-app/artifact-build.json'), 'utf8')
    );
    expect(record).toMatchObject({ frameWhenEmbedded: true, includeDevtools: true, base: './' });

    // The exact Artifact tool arguments, with absolute sources inside the pack.
    expect(data.publish).toHaveLength(1);
    const [first] = data.publish;
    expect(first?.file_path).toBe(join(realpathSync(pack), 'page.html'));
    expect(Object.keys(first?.files ?? {}).sort()).toEqual(
      data.manifest.files.map((file) => file.path).sort()
    );
    for (const source of Object.values(first?.files ?? {})) expect(existsSync(source)).toBe(true);
    expect(first).toMatchObject({ icon: 'app', description: 'A fixture prototype.' });
    expect(first && 'capabilities' in first).toBe(false);

    // The plain build in dist/ is left alone (the artifact build has its own folder).
    expect(existsSync(join(ws.root, 'artifacts/share-app/dist'))).toBe(false);
  }, 120_000);

  it('checks without writing the pack in a dry run, and reuses a matching build with --skip-build', async () => {
    ws = createWorkspace();
    addSharable(ws);
    const dry = await exportArtifact(['--dry-run']);
    expect(dry.code, dry.stderr).toBe(0);
    expect(dry.json<{ data: ArtifactData }>().data.dryRun).toBe(true);
    expect(existsSync(join(ws.root, 'artifacts/share-app/artifact'))).toBe(false);

    const reuse = await exportArtifact(['--skip-build']);
    expect(reuse.code, reuse.stderr).toBe(0);
    expect(existsSync(join(ws.root, 'artifacts/share-app/artifact/page.html'))).toBe(true);

    const mismatch = await exportArtifact(['--skip-build', '--no-devtools']);
    expect(mismatch.code).toBe(4);
    expect(mismatch.stdout + mismatch.stderr).toMatch(/made with other settings/);
  }, 120_000);

  it('declares the shared comment capabilities only for prototypes with review comments', async () => {
    ws = createWorkspace();
    addSharable(ws);
    const refused = await exportArtifact(['--comments', '--dry-run']);
    expect(refused.code).toBe(4);
    expect(refused.stdout + refused.stderr).toMatch(/--comments needs review comments enabled/);

    addSharable(ws, 'review-app', { build: { review: { enabled: true } } });
    const run = await exportArtifact(['--comments'], 'review-app');
    expect(run.code, run.stderr).toBe(0);
    const { data } = run.json<{ data: ArtifactData }>();
    expect(data.capabilities).toEqual(ARTIFACT_COMMENT_CAPABILITIES);
    expect(data.publish[0]?.capabilities).toEqual(ARTIFACT_COMMENT_CAPABILITIES);
  }, 120_000);

  it('refuses offline builds and a non-relative base before building', async () => {
    ws = createWorkspace();
    addSharable(ws, 'offline-app', { build: { offline: true } });
    const offline = await exportArtifact([], 'offline-app');
    expect(offline.code).toBe(4);
    expect(offline.stdout + offline.stderr).toMatch(
      /service worker does not belong in an artifact/
    );
    expect(existsSync(join(ws.root, 'artifacts/offline-app'))).toBe(false);

    addSharable(ws);
    expect((await exportArtifact(['--offline'])).code).toBe(4);
    const based = await exportArtifact(['--base', '/sub/']);
    expect(based.code).toBe(2);
    expect(based.stdout + based.stderr).toMatch(/relative base \.\//);
  });

  it('fails with every broken rule and writes nothing', async () => {
    ws = createWorkspace();
    addSharable(ws, 'leaky-app', {}, '<script src="https://cdn.example/track.js"></script>');
    const run = await exportArtifact([], 'leaky-app');
    expect(run.code).toBe(4);
    const body = run.json<{
      ok: boolean;
      error: { message: string };
      data?: { issues: { path: string; reason: string }[] };
    }>();
    expect(body.ok).toBe(false);
    expect(body.error.message).toMatch(/breaks 1 Claude artifact rule/);
    expect(body.data?.issues[0]?.reason).toMatch(
      /script "https:\/\/cdn\.example\/track\.js" is external/
    );
    expect(existsSync(join(ws.root, 'artifacts/leaky-app/artifact'))).toBe(false);
  }, 120_000);

  it('keeps artifact-only options off the zip export and refuses --all', async () => {
    ws = createWorkspace();
    addSharable(ws);
    const all = await cli(['--root', ws.root, '--json', 'export', '--all', '--target', 'artifact']);
    expect(all.code).toBe(2);
    const zipDry = await cli(['--root', ws.root, '--json', 'export', 'share-app', '--dry-run']);
    expect(zipDry.code).toBe(2);
    expect(zipDry.stdout + zipDry.stderr).toMatch(/apply to --target artifact only/);
  });

  it('prints the page, files, batches, sha256 and the next step in text mode', async () => {
    ws = createWorkspace();
    addSharable(ws);
    const run = await cli(['--root', ws.root, 'export', 'share-app', '--target', 'artifact']);
    expect(run.code, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/Packed share-app as a Claude artifact/);
    expect(run.stdout).toMatch(/page\s+artifacts\/share-app\/artifact\/page\.html/);
    expect(run.stdout).toMatch(/files\s+\d+ \+ the page, .* in 1 publish batch\b/);
    expect(run.stdout).toMatch(/sha256\s+[0-9a-f]{64} \(build\)/);
    expect(run.stdout).toMatch(/explicit shells keep their frame when embedded/);
    expect(readdirSync(join(ws.root, 'artifacts/share-app/artifact'))).toContain(
      'artifact-manifest.json'
    );
  }, 120_000);
});
