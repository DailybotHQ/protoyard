// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { definePrototypeFromBlueprint, parseBlueprint } from '@protoyard/blueprint';
import { type PrototypeDefinition, parseScenario } from '@protoyard/core';
import { createGenerateContext } from '@protoyard/scenarios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setQuickPlayerLocator } from '../src/commands/quick/index.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../src/lib/quick/player-assets.ts';
import {
  addCrudTemplate,
  cli,
  createWorkspace,
  linkInstalled,
  type TempWorkspace,
} from './helpers.ts';

const ANALYTICS = join(import.meta.dirname, '../../../blueprints/quick/analytics.json');

let ws: TempWorkspace;
let restore: (() => void)[] = [];

/** A tiny prebuilt player, so `quick` never needs a build (promotion never uses it). */
async function fixturePlayer(root: string) {
  const dir = join(root, 'fixture-player', 'dist', 'app');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><title>fixture player</title><script type="module" src="./assets/app.js"></script>\n'
  );
  writeFileSync(join(dir, 'assets', 'app.js'), 'export const fixture = true;\n');
  const manifest = await createPlayerAssetsManifest(dir, '1.0.0');
  return {
    dir,
    packageDir: join(root, 'fixture-player'),
    version: '1.0.0',
    manifest,
    source: 'repository' as const,
  };
}

beforeEach(async () => {
  ws = createWorkspace();
  addCrudTemplate(ws);
  const player = await fixturePlayer(ws.root);
  restore = [
    setQuickPlayerLocator(() => ({ ...player, manifest: readPlayerAssetsManifest(player.dir) })),
  ];
});
afterEach(() => {
  for (const undo of restore.splice(0)) undo();
  ws.cleanup();
});

const run = (...args: string[]) => cli(['--root', ws.root, '--json', 'quick', ...args]);

async function explore(...extra: string[]) {
  const result = await run('--blueprint', ANALYTICS, ...extra);
  expect(result.code, result.stderr || result.stdout).toBe(0);
  return result.json<{ data: { slug: string; dir: string } }>().data;
}

const quickJson = (dir: string) =>
  JSON.parse(readFileSync(join(ws.root, dir, 'quick.json'), 'utf8')) as {
    promotedTo: { slug: string; variant: string | null; at: string } | null;
    updatedAt: string;
  };

interface PromoteData {
  slug: string;
  variant: string | null;
  path: string;
  checks: { id: string; status: string }[];
  promotedTo: { slug: string; variant: string | null } | null;
  generate: { created: boolean; install: { skipped: boolean } };
}

/** A plain normal-density scenario, as the runtime parity test uses. */
const SCENARIO = parseScenario({
  id: 'promote-parity',
  name: 'Promote parity',
  seed: 4_242,
  referenceTime: '2026-06-15T12:00:00.000Z',
  density: 'normal',
  organization: {
    id: 'org_promote',
    name: 'Promote Org',
    size: 8,
    ageDays: 120,
    subscription: 'pro',
  },
});

const versions = (definition: PrototypeDefinition) =>
  definition.database.versions.map((version) => ({
    version: version.version,
    stores: version.stores,
    upgrade: typeof version.upgrade,
  }));

describe('protoyard quick promote', () => {
  it('generates a prototype the player would run identically, then records promotedTo', async () => {
    const { slug, dir } = await explore();
    const result = await run('promote', slug, 'promoted-insights', '--no-install');
    expect(result.code, result.stderr || result.stdout).toBe(0);
    const data = result.json<{ data: PromoteData }>().data;
    expect(data).toMatchObject({
      slug: 'promoted-insights',
      variant: null,
      path: 'prototypes/promoted-insights',
      promotedTo: { slug: 'promoted-insights', variant: null },
      generate: { created: true, install: { skipped: true } },
    });
    expect(data.checks.map((c) => [c.id, c.status])).toEqual([
      ['contract', expect.stringMatching(/pass|warn/)],
      ['blueprint', 'pass'],
      ['parity', 'pass'],
    ]);
    expect(quickJson(dir).promotedTo).toMatchObject({
      slug: 'promoted-insights',
      variant: null,
    });

    // Round trip: the generated prototype and the player's runtime definition of the
    // exploration blueprint derive the same database versions and seed the same world.
    linkInstalled(ws, 'promoted-insights');
    const dest = join(ws.root, 'prototypes', 'promoted-insights');
    const { definition: generated } = (await import(join(dest, 'src/prototype.ts'))) as {
      definition: PrototypeDefinition;
    };
    const explored = parseBlueprint(
      JSON.parse(readFileSync(join(ws.root, dir, 'blueprint.json'), 'utf8'))
    );
    const { definition: player } = definePrototypeFromBlueprint(explored, {
      namespace: generated.manifest.storage.namespace,
      slug: generated.manifest.slug,
    });
    expect(versions(player)).toEqual(versions(generated));
    expect(player.manifest.storage).toEqual(generated.manifest.storage);
    expect(player.generatorVersion).toBe(generated.generatorVersion);
    const fromGenerated = await generated.generate(createGenerateContext(SCENARIO));
    const fromPlayer = await player.generate(createGenerateContext(SCENARIO));
    // A seeded world, not two empty ones.
    expect(fromGenerated.personas.length).toBeGreaterThan(0);
    expect(Object.values(fromGenerated.tables).every((rows) => rows.length > 0)).toBe(true);
    expect(JSON.stringify(fromPlayer)).toBe(JSON.stringify(fromGenerated));
  }, 60_000);

  it('refuses an existing slug and leaves quick.json as it was', async () => {
    const { slug, dir } = await explore();
    expect((await run('promote', slug, 'first-cut', '--no-install')).code).toBe(0);
    const before = readFileSync(join(ws.root, dir, 'quick.json'), 'utf8');

    // Even a prototype generate itself made (which generate would regenerate).
    const again = await run('promote', slug, 'first-cut', '--no-install');
    expect(again.code).not.toBe(0);
    expect(again.json<{ error: { code: string } }>().error.code).toBe('conflict');

    ws.write('prototypes/hand-made/README.md', '# Hand made\n');
    const other = await run('promote', slug, 'hand-made', '--no-install');
    expect(other.json<{ error: { code: string } }>().error.code).toBe('conflict');
    expect(readFileSync(join(ws.root, 'prototypes/hand-made/README.md'), 'utf8')).toBe(
      '# Hand made\n'
    );
    expect(readFileSync(join(ws.root, dir, 'quick.json'), 'utf8')).toBe(before);
  }, 60_000);

  it('promotes a variant with its own blueprint', async () => {
    const { slug, dir } = await explore('--variants', '2');
    const result = await run('promote', slug, 'variant-two', '--variant', 'v2', '--no-install');
    expect(result.code, result.stderr || result.stdout).toBe(0);
    expect(result.json<{ data: PromoteData }>().data.promotedTo).toMatchObject({
      slug: 'variant-two',
      variant: 'v2',
    });
    const variant = JSON.parse(readFileSync(join(ws.root, dir, 'v2', 'blueprint.json'), 'utf8'));
    const written = JSON.parse(
      readFileSync(join(ws.root, 'prototypes/variant-two/blueprint.json'), 'utf8')
    );
    expect(parseBlueprint(written)).toEqual(parseBlueprint(variant));
    expect(quickJson(dir).promotedTo?.variant).toBe('v2');

    const missing = await run('promote', slug, 'variant-nine', '--variant', 'v7', '--no-install');
    const error = missing.json<{ error: { code: string; hint?: string } }>().error;
    expect(error.code).toBe('not_found');
    expect(error.hint).toMatch(/v1, v2/);
  }, 60_000);

  it('refuses a changed blueprint, a non-exploration folder and a missing workspace', async () => {
    const { slug, dir } = await explore();

    const notExploration = join(ws.root, 'docs-site');
    mkdirSync(notExploration, { recursive: true });
    const plain = await run('promote', notExploration, 'from-docs', '--no-install');
    expect(plain.json<{ error: { code: string } }>().error.code).toBe('unsafe_path');

    const bad = await run('promote', slug, 'Not A Slug', '--no-install');
    expect(bad.code).not.toBe(0);

    // A blueprint edited after quick.json recorded its hash is not promoted.
    const path = join(ws.root, dir, 'blueprint.json');
    const edited = JSON.parse(readFileSync(path, 'utf8'));
    edited.name = `${edited.name} edited`;
    writeFileSync(path, `${JSON.stringify(edited, null, 2)}\n`);
    const changed = await run('promote', slug, 'edited-copy', '--no-install');
    expect(changed.json<{ error: { code: string } }>().error.code).toBe('validation');

    // --root pointing at a folder that is not a workspace: a clear no_workspace error.
    const outside = mkdtempSync(join(tmpdir(), 'protoyard-no-workspace-'));
    try {
      const result = await cli([
        '--root',
        outside,
        '--json',
        'quick',
        'promote',
        join(ws.root, dir),
        'somewhere',
      ]);
      expect(result.code).toBe(3);
      const envelope = result.json<{ error: { code: string }; data: { reason: string } }>();
      expect(envelope.error.code).toBe('not_found');
      expect(envelope.data.reason).toBe('no_workspace');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
    expect(quickJson(dir).promotedTo).toBeNull();
  }, 60_000);
});
