import { blueprintIdentity, parseBlueprint } from '@protoyard/blueprint';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import demo from '../src/fixtures/demo.blueprint.json';
import {
  clearExploration,
  keepNamespace,
  listExplorations,
  markActiveExploration,
  openPlayerIndex,
  PLAYER_ACTIVE_NAMESPACE_KEY,
  PLAYER_INDEX_DATABASE,
  resolvePlayerStorage,
} from '../src/storage/index.ts';

let factory = new IDBFactory();

afterEach(async () => {
  for (const info of await factory.databases()) {
    if (info.name) await deleteDatabase(info.name);
  }
  factory = new IDBFactory();
});

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function createDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('rows', { keyPath: 'id' });
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

describe('player storage isolation', () => {
  it('keeps content identities separate while keep mode remains stable across edits', async () => {
    const first = parseBlueprint(demo);
    const edited = parseBlueprint({ ...demo, name: `${demo.name} v2` });
    const firstIdentity = await resolvePlayerStorage(first, await blueprintIdentity(first));
    const editedIdentity = await resolvePlayerStorage(edited, await blueprintIdentity(edited));
    const keptFirst = await resolvePlayerStorage(
      first,
      await blueprintIdentity(first),
      '?keep=Dispatch%20team'
    );
    const keptEdited = await resolvePlayerStorage(
      edited,
      await blueprintIdentity(edited),
      '?keep=Dispatch%20team'
    );

    expect(firstIdentity.namespace).not.toBe(editedIdentity.namespace);
    expect(keptFirst.namespace).toBe(keptEdited.namespace);
    expect(keptFirst.namespace).toBe(await keepNamespace('Dispatch team'));
    expect(keptFirst.namespace).toMatch(/^keep-[a-f0-9]{26}$/);
    expect(keptFirst.identity.sha256).not.toBe(keptEdited.identity.sha256);
  });

  it('lists the player index and clears only the selected exploration databases', async () => {
    const index = await openPlayerIndex(factory);
    await index.put({
      namespace: 'bp-alpha',
      name: 'Alpha',
      identitySha256: 'a'.repeat(64),
      lastOpened: '2026-01-01T00:00:00.000Z',
      sizeEstimateBytes: 123,
    });
    await index.put({
      namespace: 'bp-beta',
      name: 'Beta',
      identitySha256: 'b'.repeat(64),
      lastOpened: '2026-01-02T00:00:00.000Z',
    });
    index.close();

    await createDatabase('protoyard.bp-alpha.data');
    await createDatabase('protoyard.bp-alpha.control');
    await createDatabase('protoyard.bp-alpha.validation');
    await createDatabase('protoyard.bp-beta.data');
    await createDatabase('protoyard.bp-beta.control');
    await createDatabase('protoyard.bp-beta.validation');

    await expect(clearExploration('bp-alpha', {}, factory)).rejects.toThrow(/confirmation/i);
    await clearExploration('bp-alpha', { confirmed: true }, factory);

    const names = (await factory.databases()).map((info) => info.name).sort();
    expect(names).toEqual([
      'protoyard.bp-beta.control',
      'protoyard.bp-beta.data',
      'protoyard.bp-beta.validation',
      PLAYER_INDEX_DATABASE,
    ]);
    expect(await listExplorations(factory)).toEqual([
      {
        namespace: 'bp-beta',
        name: 'Beta',
        identitySha256: 'b'.repeat(64),
        lastOpened: '2026-01-02T00:00:00.000Z',
        sizeEstimateBytes: null,
      },
    ]);
  });

  it('records the active namespace for the pre-paint appearance replay', () => {
    const values = new Map<string, string>();
    const storage = {
      setItem(key: string, value: string) {
        values.set(key, value);
      },
    };
    expect(markActiveExploration('bp-alpha', storage)).toBe(true);
    expect(values.get(PLAYER_ACTIVE_NAMESPACE_KEY)).toBe('bp-alpha');
  });
});
