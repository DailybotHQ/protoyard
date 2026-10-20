import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { Page, WikiDatabase } from '../src/database/schema.ts';
import { createServices } from '../src/domain/services.ts';
import { ValidationError } from '../src/domain/validation.ts';
import { definition } from '../src/prototype.ts';

/**
 * Domain tests on the REAL runtime with an in-memory IndexedDB. `reload()`
 * closes the runtime and opens a new one on the same storage, like a page
 * reload, so these prove persistence, not just in-memory state.
 */

let harness = createHarness<WikiDatabase>(definition);
afterEach(() => {
  harness.closeAll();
  harness = createHarness<WikiDatabase>(definition);
});

const issues = (e: unknown) => (e instanceof ValidationError ? e.issues : {});
const versionsOf = async (db: WikiDatabase, pageId: string) =>
  (await db.versions.where('pageId').equals(pageId).toArray()).sort(
    (a, b) => a.version - b.version
  );
const byTitle = async (db: WikiDatabase, title: string) =>
  (await db.pages.filter((p) => p.title === title).first()) as Page;

describe('wiki services on the real runtime', () => {
  it('creates a space and pages, each with version 1, surviving a reload', async () => {
    let runtime = await harness.boot('empty'); // owner
    let services = createServices(runtime);
    const space = await services.spaces.create({
      name: 'Design',
      key: 'des',
      description: 'Design system',
    });
    expect(space.key).toBe('DES');
    const overview = await runtime.db.pages.where('spaceId').equals(space.id).first();
    const child = await services.pages.create({
      spaceId: space.id,
      parentId: overview?.id ?? null,
      title: 'Tokens',
      body: '# Tokens',
    });
    const sibling = await services.pages.create({
      spaceId: space.id,
      parentId: overview?.id ?? null,
      title: 'Icons',
    });
    expect(sibling.rank > child.rank).toBe(true);
    expect(
      issues(await services.spaces.create({ name: 'Again', key: 'DES' }).catch((e: unknown) => e))
        .key
    ).toMatch(/taken/);

    runtime = await harness.reload(runtime);
    services = createServices(runtime);
    expect(await runtime.db.pages.count()).toBe(3);
    expect(
      (await versionsOf(runtime.db, child.id)).map((v) => [v.version, v.note, v.body])
    ).toEqual([[1, 'Created', '# Tokens']]);
  });

  it('saves a new version per change, skips unchanged saves and refuses stale editors', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const page = await byTitle(runtime.db, 'Code review');
    const v = page.version;
    const saved = await services.pages.save(page.id, {
      title: page.title,
      body: `${page.body}\n\nNew rule.`,
      baseVersion: v,
    });
    expect(saved.version).toBe(v + 1);
    expect(saved.updatedBy).toBe('user_0002');
    // Same content again: nothing written.
    await services.pages.save(page.id, {
      title: saved.title,
      body: saved.body,
      baseVersion: v + 1,
    });
    expect((await versionsOf(runtime.db, page.id)).length).toBe(v + 1);
    // An editor still on the old version cannot overwrite the newer one.
    const stale = await services.pages
      .save(page.id, { title: 'Mine', body: 'old', baseVersion: v })
      .catch((e: unknown) => e);
    expect(issues(stale).body).toMatch(
      new RegExp(`Version ${v + 1} was saved while you were editing`)
    );
    expect((await runtime.db.pages.get(page.id))?.title).toBe(page.title);
  });

  it('restores an old version as a new one, keeping the history', async () => {
    let runtime = await harness.boot('active');
    let services = createServices(runtime);
    const page = await byTitle(runtime.db, 'Branching and releases');
    const first = (await versionsOf(runtime.db, page.id))[0];
    await services.pages.save(page.id, {
      title: 'Branching',
      body: 'Rewritten.',
      baseVersion: page.version,
    });
    const restored = await services.pages.restore(page.id, 1);
    expect(restored).toMatchObject({
      body: first?.body,
      title: first?.title,
      version: page.version + 2,
    });
    await expect(services.pages.restore(page.id, restored.version)).rejects.toBeInstanceOf(
      ValidationError
    );

    runtime = await harness.reload(runtime);
    services = createServices(runtime);
    const history = await versionsOf(runtime.db, page.id);
    expect(history.at(-1)).toMatchObject({ note: 'Restored v1', body: first?.body });
    expect(history.at(-2)).toMatchObject({ note: 'Edited', body: 'Rewritten.' });
  });

  it('moves pages within a space and refuses cycles and other spaces', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const architecture = await byTitle(runtime.db, 'Architecture');
    const billing = await byTitle(runtime.db, 'Billing service');
    const roadmap = await byTitle(runtime.db, 'Roadmap');
    const cycle = await services.pages
      .move(architecture.id, { parentId: billing.id, rank: 'm' })
      .catch((e: unknown) => e);
    expect(issues(cycle).parentId).toMatch(/inside itself/);
    const away = await services.pages
      .move(billing.id, { parentId: roadmap.id, rank: 'm' })
      .catch((e: unknown) => e);
    expect(issues(away).parentId).toMatch(/within their space/);
    await services.pages.move(billing.id, { parentId: null, rank: 'zz' });
    const moved = await runtime.db.pages.get(billing.id);
    expect(moved).toMatchObject({ parentId: null, rank: 'zz', version: billing.version });
  });

  it('deletes only leaf pages, together with their history', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const parent = await byTitle(runtime.db, 'Runbooks');
    const leaf = await byTitle(runtime.db, 'Restore a backup');
    expect(issues(await services.pages.remove(parent.id).catch((e: unknown) => e)).page).toMatch(
      /subpages/
    );
    await services.pages.remove(leaf.id);
    expect(await runtime.db.pages.get(leaf.id)).toBeUndefined();
    expect(await runtime.db.versions.where('pageId').equals(leaf.id).count()).toBe(0);
  });

  it('validates titles, parents and spaces', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const eng = await runtime.db.spaces.where('key').equals('ENG').first();
    const product = await byTitle(runtime.db, 'Roadmap');
    const attempt = (input: Parameters<typeof services.pages.create>[0]) =>
      services.pages.create(input).catch((e: unknown) => issues(e));
    expect((await attempt({ spaceId: eng?.id ?? '', title: '   ' })).title).toMatch(/title/);
    expect(
      (await attempt({ spaceId: eng?.id ?? '', parentId: product.id, title: 'x' })).parentId
    ).toMatch(/not in this space/);
    expect((await attempt({ spaceId: 'space_missing', title: 'x' })).spaceId).toMatch(
      /no longer exists/
    );
  });

  it('denies every change to the viewer, and spaces to editors', async () => {
    const runtime = await harness.boot('viewer');
    const services = createServices(runtime);
    const page = await byTitle(runtime.db, 'Code review');
    const before = await runtime.db.versions.count();
    for (const attempt of [
      services.pages.create({ spaceId: page.spaceId, title: 'x' }),
      services.pages.save(page.id, { title: 'x', body: 'y', baseVersion: page.version }),
      services.pages.restore(page.id, 1),
      services.pages.move(page.id, { parentId: null, rank: 'z' }),
      services.pages.remove(page.id),
      services.spaces.create({ name: 'Nope', key: 'NOPE' }),
    ]) {
      await expect(attempt).rejects.toBeInstanceOf(PermissionDeniedError);
    }
    await runtime.session.switchActor('user_0003'); // editor
    await expect(services.spaces.create({ name: 'Nope', key: 'NOPE' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    expect(await runtime.db.versions.count()).toBe(before);
  });

  it('writes neither the page nor a version when the save fails offline', async () => {
    const runtime = await harness.boot('active');
    const services = createServices(runtime);
    const page = await byTitle(runtime.db, 'Testing strategy');
    const versions = await runtime.db.versions.count();
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(
      services.pages.save(page.id, { title: 'Offline', body: 'x', baseVersion: page.version })
    ).rejects.toBeInstanceOf(SimulatedServiceError);
    await expect(
      services.pages.create({ spaceId: page.spaceId, title: 'Offline' })
    ).rejects.toBeInstanceOf(SimulatedServiceError);
    expect(await runtime.db.pages.get(page.id)).toEqual(page);
    expect(await runtime.db.versions.count()).toBe(versions);
  });

  it('loads the same world for a scenario every time', async () => {
    for (const id of definition.manifest.scenarios) {
      const a = await harness.boot(id);
      const pages = (await a.db.pages.toArray()).map((p) => [p.id, p.title, p.version, p.rank]);
      harness.closeAll();
      harness = createHarness<WikiDatabase>(definition);
      const b = await harness.boot(id);
      expect(
        (await b.db.pages.toArray()).map((p) => [p.id, p.title, p.version, p.rank]),
        id
      ).toEqual(pages);
      harness.closeAll();
      harness = createHarness<WikiDatabase>(definition);
    }
  }, 60_000);
});
