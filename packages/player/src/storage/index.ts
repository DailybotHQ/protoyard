import type { Blueprint, BlueprintIdentity } from '@protoyard/blueprint';
import { Dexie, type Table } from 'dexie';

/** The player index is separate from every blueprint's data and control DB. */
export const PLAYER_INDEX_DATABASE = 'protoyard.player.index';
export const PLAYER_ACTIVE_NAMESPACE_KEY = 'protoyard.player.active-namespace';

const KEEP_NAME_LIMIT = 80;
const PLAYER_NAMESPACE = /^(?:bp|keep)-[a-z0-9-]+$/;

export interface ExplorationRecord {
  namespace: string;
  name: string;
  identitySha256: string;
  lastOpened: string;
  /** Origin-wide StorageManager usage at the last open, not a per-world byte count. */
  sizeEstimateBytes?: number;
}

export interface ExplorationSummary extends Omit<ExplorationRecord, 'sizeEstimateBytes'> {
  sizeEstimateBytes: number | null;
}

export interface PlayerStoragePlan {
  identity: BlueprintIdentity;
  namespace: string;
  name: string;
  keepName: string | null;
}

export interface PlayerIndexStore {
  list(): Promise<ExplorationSummary[]>;
  put(record: ExplorationRecord): Promise<void>;
  remove(namespace: string): Promise<void>;
  close(): void;
}

export interface ClearExplorationOptions {
  /** The caller must obtain confirmation from the person before setting this. */
  confirmed?: boolean;
  /** Optional UI confirmation hook for callers that cannot preflight confirmation. */
  confirm?: () => boolean | Promise<boolean>;
}

interface StorageEstimateLike {
  estimate?: () => Promise<{ usage?: number }>;
}

class PlayerIndexDatabase extends Dexie {
  explorations!: Table<ExplorationRecord, string>;

  constructor(indexedDB?: IDBFactory) {
    super(PLAYER_INDEX_DATABASE, indexedDB ? { indexedDB } : undefined);
    this.version(1).stores({ explorations: 'namespace,lastOpened' });
  }
}

function resolveIndexedDB(indexedDB?: IDBFactory): IDBFactory | undefined {
  return indexedDB ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
}

async function originUsageBytes(): Promise<number | undefined> {
  const storage = (globalThis as { navigator?: { storage?: StorageEstimateLike } }).navigator
    ?.storage;
  if (!storage?.estimate) return undefined;
  try {
    const estimate = await storage.estimate();
    return typeof estimate.usage === 'number' ? estimate.usage : undefined;
  } catch {
    return undefined;
  }
}

function validKeepName(name: string): string {
  const trimmed = name.trim();
  const hasControlCharacter = [...trimmed].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (!trimmed || trimmed.length > KEEP_NAME_LIMIT || hasControlCharacter) {
    throw new Error(`keep name must be 1-${KEEP_NAME_LIMIT} printable characters`);
  }
  return trimmed;
}

/** Reads the optional stable exploration name without consuming sandbox params. */
export function keepNameFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get('keep');
  return value === null || value.trim() === '' ? null : validKeepName(value);
}

/**
 * Derives a stable namespace from a keep name. The name is not put in the
 * database name, avoiding punctuation and collisions between similar labels.
 */
export async function keepNamespace(name: string): Promise<string> {
  const normalized = validKeepName(name).normalize('NFKC').toLowerCase();
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('keep mode needs Web Crypto (crypto.subtle)');
  const digest = new Uint8Array(
    await subtle.digest('SHA-256', new TextEncoder().encode(`protoyard.keep\u0000${normalized}`))
  );
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `keep-${hex.slice(0, 26)}`;
}

/** Resolves content-addressed storage by default, or stable keep-mode storage. */
export async function resolvePlayerStorage(
  blueprint: Blueprint,
  identity: BlueprintIdentity,
  search = ''
): Promise<PlayerStoragePlan> {
  const keepName = keepNameFromSearch(search);
  return {
    identity,
    namespace: keepName ? await keepNamespace(keepName) : identity.namespace,
    name: keepName ?? blueprint.name,
    keepName,
  };
}

export async function openPlayerIndex(indexedDB?: IDBFactory): Promise<PlayerIndexStore> {
  if (!resolveIndexedDB(indexedDB))
    throw new Error('IndexedDB is unavailable for the player index');
  const db = new PlayerIndexDatabase(indexedDB);
  await db.open();
  return {
    async list() {
      const rows = await db.explorations.orderBy('lastOpened').reverse().toArray();
      return rows.map((row) => ({ ...row, sizeEstimateBytes: row.sizeEstimateBytes ?? null }));
    },
    async put(record) {
      await db.explorations.put(record);
    },
    async remove(namespace) {
      await db.explorations.delete(namespace);
    },
    close() {
      db.close();
    },
  };
}

/** Records the latest open and best-effort origin usage estimate. */
export async function recordExploration(
  plan: PlayerStoragePlan,
  indexedDB?: IDBFactory
): Promise<boolean> {
  if (!resolveIndexedDB(indexedDB)) return false;
  const index = await openPlayerIndex(indexedDB);
  try {
    const usage = await originUsageBytes();
    await index.put({
      namespace: plan.namespace,
      name: plan.name,
      identitySha256: plan.identity.sha256,
      lastOpened: new Date().toISOString(),
      ...(usage === undefined ? {} : { sizeEstimateBytes: usage }),
    });
    return true;
  } finally {
    index.close();
  }
}

export async function listExplorations(indexedDB?: IDBFactory): Promise<ExplorationSummary[]> {
  if (!resolveIndexedDB(indexedDB)) return [];
  const index = await openPlayerIndex(indexedDB);
  try {
    return await index.list();
  } finally {
    index.close();
  }
}

function deleteDatabase(indexedDB: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Could not clear ${name}`));
    request.onblocked = () => reject(new Error(`Could not clear ${name}: another tab is open`));
  });
}

/** Clears only one blueprint's data and control databases after confirmation. */
export async function clearExploration(
  namespace: string,
  options: ClearExplorationOptions = {},
  indexedDB?: IDBFactory
): Promise<void> {
  if (!PLAYER_NAMESPACE.test(namespace)) throw new Error(`Invalid player namespace "${namespace}"`);
  const accepted =
    options.confirmed === true || (options.confirm ? await options.confirm() : false);
  if (!accepted) throw new Error('Clearing an exploration requires confirmation');
  const factory = resolveIndexedDB(indexedDB);
  if (!factory) throw new Error('IndexedDB is unavailable for the player');
  await deleteDatabase(factory, `protoyard.${namespace}.data`);
  await deleteDatabase(factory, `protoyard.${namespace}.control`);
  const index = await openPlayerIndex(factory);
  try {
    await index.remove(namespace);
  } finally {
    index.close();
  }
}

/** Makes the next static paint replay this blueprint's cached appearance. */
export function markActiveExploration(
  namespace: string,
  storage: Pick<Storage, 'setItem'> | undefined = (() => {
    try {
      return globalThis.localStorage;
    } catch {
      return undefined;
    }
  })()
): boolean {
  try {
    storage?.setItem(PLAYER_ACTIVE_NAMESPACE_KEY, namespace);
    return Boolean(storage);
  } catch {
    return false;
  }
}
