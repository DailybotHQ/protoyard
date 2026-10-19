import type {
  ArtifactCapability,
  ArtifactClaude,
  ArtifactCollectionReference,
  ArtifactCollectionSnapshot,
  ArtifactDatabase,
  ArtifactDocumentReference,
  ArtifactDocumentSnapshot,
  ArtifactProfile,
  ArtifactUser,
} from '../../src/adapters/artifact.ts';

export interface FakeClaudeOptions {
  userId?: string;
  profiles?: Record<string, ArtifactProfile>;
  canWrite?: boolean | null;
  canError?: { code: string; message?: string };
  useNull?: Partial<Record<ArtifactCapability, boolean>>;
  useError?: Partial<Record<ArtifactCapability, { code: string; message?: string }>>;
  writeError?: { code: string; message?: string };
  writeDelayMs?: number;
}

export interface FakeClaude {
  claude: ArtifactClaude;
  db: ArtifactDatabase;
  user: ArtifactUser;
  values: Map<string, Record<string, unknown>>;
  uses: ArtifactCapability[];
  profileRequests: string[][];
  writes: { set: number; update: number; delete: number };
  maxConcurrentWrites: number;
  canCalls: number;
  activeSubscriptions: number;
  maxActiveSubscriptions: number;
  options: FakeClaudeOptions;
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function failure(error: { code: string; message?: string }) {
  return Object.assign(new Error(error.message ?? error.code), { code: error.code });
}

function documentSnapshot(
  path: string,
  values: Map<string, Record<string, unknown>>
): ArtifactDocumentSnapshot {
  const value = values.get(path);
  return {
    id: path.split('/').at(-1) ?? '',
    exists: value !== undefined,
    data: value ? copy(value) : {},
  };
}

function collectionSnapshot(
  path: string,
  values: Map<string, Record<string, unknown>>
): ArtifactCollectionSnapshot {
  const prefix = `${path}/`;
  const docs = [...values]
    .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key]) => documentSnapshot(key, values));
  return { docs };
}

export function createFakeClaude(options: FakeClaudeOptions = {}): FakeClaude {
  const values = new Map<string, Record<string, unknown>>();
  const collectionListeners = new Map<
    string,
    Set<(snapshot: ArtifactCollectionSnapshot) => void>
  >();
  const documentListeners = new Map<string, Set<(snapshot: ArtifactDocumentSnapshot) => void>>();
  const uses: ArtifactCapability[] = [];
  const profileRequests: string[][] = [];
  const writes = { set: 0, update: 0, delete: 0 };
  const state = {
    activeSubscriptions: 0,
    maxActiveSubscriptions: 0,
    canCalls: 0,
    activeWrites: 0,
    maxConcurrentWrites: 0,
  };

  async function beforeWrite(): Promise<void> {
    if (options.writeError) throw failure(options.writeError);
    state.activeWrites += 1;
    state.maxConcurrentWrites = Math.max(state.maxConcurrentWrites, state.activeWrites);
    if (options.writeDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.writeDelayMs));
    }
  }

  function afterWrite(): void {
    state.activeWrites -= 1;
  }

  function subscribe<T>(
    listeners: Map<string, Set<(snapshot: T) => void>>,
    path: string,
    listener: (snapshot: T) => void,
    snapshot: () => T
  ): () => void {
    const group = listeners.get(path) ?? new Set();
    group.add(listener);
    listeners.set(path, group);
    state.activeSubscriptions += 1;
    state.maxActiveSubscriptions = Math.max(
      state.maxActiveSubscriptions,
      state.activeSubscriptions
    );
    queueMicrotask(() => listener(snapshot()));
    return () => {
      if (!group.delete(listener)) return;
      state.activeSubscriptions -= 1;
      if (group.size === 0) listeners.delete(path);
    };
  }

  function notify(path: string): void {
    const parent = path.slice(0, path.lastIndexOf('/'));
    const collectionGroup = collectionListeners.get(parent);
    if (collectionGroup) {
      const snapshot = collectionSnapshot(parent, values);
      for (const listener of collectionGroup) listener(copy(snapshot));
    }
    const documentGroup = documentListeners.get(path);
    if (documentGroup) {
      const snapshot = documentSnapshot(path, values);
      for (const listener of documentGroup) listener(copy(snapshot));
    }
  }

  const db: ArtifactDatabase = {
    collection(path): ArtifactCollectionReference {
      return {
        async get() {
          return collectionSnapshot(path, values);
        },
        onSnapshot(onChange) {
          return subscribe(collectionListeners, path, onChange, () =>
            collectionSnapshot(path, values)
          );
        },
      };
    },
    doc(path): ArtifactDocumentReference {
      return {
        async get() {
          return documentSnapshot(path, values);
        },
        async set(data) {
          await beforeWrite();
          try {
            writes.set += 1;
            values.set(path, copy(data));
            notify(path);
          } finally {
            afterWrite();
          }
        },
        async update(data) {
          await beforeWrite();
          try {
            const existing = values.get(path);
            if (!existing) throw Object.assign(new Error('not found'), { code: 'not_found' });
            writes.update += 1;
            values.set(path, { ...existing, ...copy(data) });
            notify(path);
          } finally {
            afterWrite();
          }
        },
        async delete() {
          await beforeWrite();
          try {
            writes.delete += 1;
            values.delete(path);
            notify(path);
          } finally {
            afterWrite();
          }
        },
        onSnapshot(onChange) {
          return subscribe(documentListeners, path, onChange, () => documentSnapshot(path, values));
        },
      };
    },
  };

  const user: ArtifactUser = {
    id: () => options.userId ?? 'user-reviewer-001',
    async profiles(ids) {
      profileRequests.push([...ids]);
      return Object.fromEntries(
        ids.filter((id) => options.profiles?.[id]).map((id) => [id, options.profiles?.[id]])
      ) as Record<string, ArtifactProfile>;
    },
    can() {
      state.canCalls += 1;
      if (options.canError) throw failure(options.canError);
      return options.canWrite === undefined ? true : options.canWrite;
    },
  };

  const claude: ArtifactClaude = {
    async use(capability) {
      uses.push(capability);
      if (options.useError?.[capability]) throw failure(options.useError[capability]);
      if (options.useNull?.[capability]) return null;
      return capability === 'db' ? db : user;
    },
  };

  return {
    claude,
    db,
    user,
    values,
    uses,
    profileRequests,
    writes,
    get maxConcurrentWrites() {
      return state.maxConcurrentWrites;
    },
    get canCalls() {
      return state.canCalls;
    },
    get activeSubscriptions() {
      return state.activeSubscriptions;
    },
    get maxActiveSubscriptions() {
      return state.maxActiveSubscriptions;
    },
    options,
  };
}
