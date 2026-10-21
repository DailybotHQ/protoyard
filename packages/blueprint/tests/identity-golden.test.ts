// @vitest-environment node
/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { blueprintIdentity, loadUntrustedBlueprint, parseBlueprint } from '../src/index.ts';

/**
 * Frozen content identities (ADR-030) of every blueprint the repository ships:
 * the catalog (`blueprints/**`), the player fixture, generated prototypes and
 * the crud-app template. A blueprint's sha256 names its player storage
 * namespace, world cache entries and share-link identity, so a schema change
 * (the kind union, sanitizer changes, new defaults) must leave every one of
 * these unchanged. A failure here means saved player worlds would be orphaned.
 *
 * New blueprints do not need an entry. To add entries deliberately, run with
 * `UPDATE_IDENTITY_GOLDEN=1`; it refuses to change an existing identity.
 */

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const GOLDEN = fileURLToPath(new URL('./fixtures/identity-golden.json', import.meta.url));

type Identity = { sha256: string; namespace: string };
type Golden = Record<string, Identity>;

const posix = (path: string) => relative(ROOT, path).split(sep).join('/');

function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return jsonFiles(full);
    return entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('.')
      ? [full]
      : [];
  });
}

/** Every shipped blueprint, as repository-relative POSIX paths. */
function shippedBlueprints(): string[] {
  const named = (dir: string) =>
    existsSync(join(ROOT, dir))
      ? readdirSync(join(ROOT, dir))
          .map((name) => join(ROOT, dir, name, 'blueprint.json'))
          .filter((path) => existsSync(path))
      : [];
  return [
    ...jsonFiles(join(ROOT, 'blueprints')),
    join(ROOT, 'packages/player/src/fixtures/demo.blueprint.json'),
    join(ROOT, 'packages/blueprint/tests/fixtures/large.blueprint.json'),
    ...named('prototypes'),
    ...named('templates'),
  ]
    .map(posix)
    .sort();
}

const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Golden;
const entries = Object.entries(golden).sort(([a], [b]) => a.localeCompare(b));
const readText = (path: string) => readFileSync(join(ROOT, ...path.split('/')), 'utf8');

describe('identity golden file', () => {
  it('freezes at least 45 blueprints, all well formed', () => {
    expect(entries.length).toBeGreaterThanOrEqual(45);
    for (const [path, identity] of entries) {
      expect(path, path).toMatch(/\.json$/);
      expect(identity.sha256, path).toMatch(/^[0-9a-f]{64}$/);
      expect(identity.namespace, path).toMatch(/^bp-[a-z2-7]{26}$/);
    }
  });

  it('covers every app blueprint shipped today', () => {
    // A frozen file that disappears would silently shrink the guarantee.
    for (const [path] of entries) expect(existsSync(join(ROOT, path)), path).toBe(true);
    expect(shippedBlueprints()).toEqual(expect.arrayContaining(Object.keys(golden)));
  });

  it.each(entries)('%s keeps its parsed identity', async (path, identity) => {
    const parsed = parseBlueprint(JSON.parse(readText(path)) as unknown);
    expect(await blueprintIdentity(parsed)).toEqual(identity);
  });

  it.each(entries)('%s keeps its identity through the untrusted loader', async (path, identity) => {
    // The player derives its namespace from the sanitized blueprint, not the raw file.
    const loaded = loadUntrustedBlueprint(readText(path));
    expect(loaded.issues).toEqual([]);
    if (!loaded.success) throw new Error(`${path} was refused by the untrusted loader`);
    expect(await blueprintIdentity(loaded.blueprint)).toEqual(identity);
  });
});

if (process.env.UPDATE_IDENTITY_GOLDEN === '1') {
  it('writes new golden entries without changing existing ones', async () => {
    const next: Golden = { ...golden };
    for (const path of shippedBlueprints()) {
      const parsed = parseBlueprint(JSON.parse(readText(path)) as unknown);
      const identity = await blueprintIdentity(parsed);
      const frozen = golden[path];
      if (
        frozen &&
        (frozen.sha256 !== identity.sha256 || frozen.namespace !== identity.namespace)
      ) {
        throw new Error(
          `${path} changed identity; fix the cause instead of refreshing the golden.`
        );
      }
      next[path] = { sha256: identity.sha256, namespace: identity.namespace };
    }
    const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(GOLDEN, `${JSON.stringify(sorted, null, 2)}\n`);
  });
}
