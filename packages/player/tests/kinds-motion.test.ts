import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AnyBlueprint, loadUntrustedDocument, parseBlueprint } from '@protoyard/blueprint';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { configure } from '@testing-library/svelte';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type BootedPlayer, bootPlayer } from '../src/boot.ts';
import { bootKind } from '../src/boot-kind.ts';
import demo from '../src/fixtures/demo.blueprint.json';
import { loadersFor } from '../src/kinds/renderers.ts';
import { motionProbe } from './support/motion-probe.ts';

configure({ asyncUtilTimeout: 10_000 });

/**
 * The blueprint `motion` block in the player: its level reaches every Texuli
 * component through a `texuli/motion` MotionProvider (apps and kinds), a
 * deck's own `style.motion` is capped by it, and a streamed draft says it is
 * still arriving. `texuli/motion` is wrapped by a probe that records each
 * provider's level and renders the real one.
 */
vi.mock('texuli/motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('texuli/motion')>();
  const { motionProbe: probe } = await import('./support/motion-probe.ts');
  probe.Real = actual.MotionProvider as never;
  const { default: MotionProbe } = await import('./support/MotionProbe.svelte');
  return { ...actual, MotionProvider: MotionProbe };
});

const FIXTURES = join(import.meta.dirname, '../../blueprint/tests/fixtures/kinds');
async function kind(name: string, extra: Record<string, unknown> = {}): Promise<AnyBlueprint> {
  const raw = { ...JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')), ...extra };
  const loaded = await loadUntrustedDocument(JSON.stringify(raw));
  if (!loaded.success) throw new Error(JSON.stringify(loaded.issues));
  return loaded.blueprint;
}

const runtimeOn = (indexedDB: IDBFactory) =>
  ((definition, options) =>
    createPrototypeRuntime(definition, {
      ...options,
      indexedDB,
      IDBKeyRange,
      sleep: async () => {},
    })) satisfies Parameters<typeof bootKind>[0]['createRuntime'];

describe('blueprint motion in the player', () => {
  let booted: BootedPlayer | undefined;
  beforeEach(() => {
    motionProbe.levels.length = 0;
  });
  afterEach(async () => {
    await booted?.destroy();
    booted = undefined;
    document.body.replaceChildren();
  });

  async function bootDeck(blueprint: AnyBlueprint, draft?: boolean) {
    const target = document.body.appendChild(document.createElement('div'));
    const indexedDB = new IDBFactory();
    booted = await bootKind({
      blueprint,
      loaders: loadersFor((blueprint as { kind: 'deck' | 'page' | 'doc' }).kind),
      target,
      search: '',
      indexFactory: indexedDB,
      createRuntime: runtimeOn(indexedDB),
      ...(draft ? { draft } : {}),
    });
    await vi.waitFor(() => expect(target.querySelector('[data-py-deck-app]')).not.toBeNull(), {
      timeout: 10_000,
    });
    return target;
  }

  it('plays a deck at full motion when the blueprint declares none', async () => {
    const target = await bootDeck(await kind('intro.deck.json'));
    expect(motionProbe.levels).toContain('full');
    expect(motionProbe.levels).not.toContain('none');
    expect(target.querySelector('[data-py-deck-motion]')?.getAttribute('data-py-deck-motion')).toBe(
      'default'
    );
    expect(target.querySelector('[data-py-draft]')).toBeNull();
  });

  it('caps Texuli motion and the deck’s own transitions at the blueprint level', async () => {
    const target = await bootDeck(await kind('intro.deck.json', { motion: { level: 'none' } }));
    expect(motionProbe.levels).toContain('none');
    expect(target.querySelector('[data-py-deck-motion]')?.getAttribute('data-py-deck-motion')).toBe(
      'none'
    );
  });

  it('applies the level to pages and docs', async () => {
    const target = document.body.appendChild(document.createElement('div'));
    const indexedDB = new IDBFactory();
    booted = await bootKind({
      blueprint: await kind('landing.page.json', { motion: { level: 'subtle' } }),
      loaders: loadersFor('page'),
      target,
      search: '',
      indexFactory: indexedDB,
      createRuntime: runtimeOn(indexedDB),
    });
    await vi.waitFor(() => expect(target.querySelector('[data-py-page-app]')).not.toBeNull());
    expect(motionProbe.levels).toContain('subtle');
  });

  it('says a streamed draft is still arriving', async () => {
    const target = await bootDeck(await kind('intro.deck.json'), true);
    const notice = target.querySelector('[data-py-draft]');
    expect(notice?.getAttribute('role')).toBe('status');
    expect(notice?.textContent).toMatch(/Receiving the deck/);
  });

  it('applies the level to an app', async () => {
    const target = document.body.appendChild(document.createElement('div'));
    const indexedDB = new IDBFactory();
    booted = await bootPlayer({
      blueprint: parseBlueprint({ ...demo, motion: { level: 'subtle' } }),
      target,
      search: '',
      indexFactory: indexedDB,
      createRuntime: runtimeOn(indexedDB),
    });
    expect(booted.error).toBeNull();
    await vi.waitFor(() => expect(motionProbe.levels).toContain('subtle'));
  });
});
