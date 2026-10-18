import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

export const PROVIDERS = ['Northstar Drive', 'Copperline Calendar', 'Tandem Tasks'] as const;
export type Provider = (typeof PROVIDERS)[number];
export type SyncState = 'active' | 'paused';

export type ConnectedItem = {
  id: string;
  label: string;
  provider: Provider;
  account: string;
  syncState: SyncState;
  connectedAt: string;
  updatedAt: string;
};

export type PluginSettings = {
  id: 'workspace';
  autoSync: boolean;
  notifyOnChange: boolean;
  updatedAt: string;
};

export type PluginDatabase = Dexie & {
  connectedItems: EntityTable<ConnectedItem, 'id'>;
  settings: EntityTable<PluginSettings, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        connectedItems: 'id, provider, syncState, updatedAt',
        settings: 'id',
      },
    },
  ],
};
