import { createRuntimeId, type PrototypeRuntime, parseInput } from '@protoyard/core';
import { z } from 'zod';
import type { ConnectedItem, PluginDatabase, Provider, SyncState } from '../database/schema.ts';
import { PROVIDERS } from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';

export const ConnectedItemInputSchema = z.object({
  label: z.string().trim().min(1, 'Enter a name for this connection.').max(48),
  provider: z.enum(PROVIDERS),
  account: z.email('Enter a valid fictional email address.'),
  syncState: z.enum(['active', 'paused']),
});
export type ConnectedItemInput = z.input<typeof ConnectedItemInputSchema>;

export const SettingsInputSchema = z.object({
  autoSync: z.boolean(),
  notifyOnChange: z.boolean(),
});

export function createPluginServices(runtime: PrototypeRuntime<PluginDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();

  return {
    async create(input: ConnectedItemInput): Promise<ConnectedItem> {
      session.assert(CAPABILITIES.manage);
      const data = parseInput(ConnectedItemInputSchema, input);
      return environment.run('integrations.create', async () => {
        const at = now();
        const item: ConnectedItem = {
          id: createRuntimeId('integration'),
          ...data,
          connectedAt: at,
          updatedAt: at,
        };
        return db.transaction('rw', db.connectedItems, async () => {
          await db.connectedItems.add(item);
          return item;
        });
      });
    },

    async update(id: string, input: ConnectedItemInput): Promise<void> {
      session.assert(CAPABILITIES.manage);
      const data = parseInput(ConnectedItemInputSchema, input);
      await environment.run('integrations.update', async () => {
        await db.transaction('rw', db.connectedItems, async () => {
          const changed = await db.connectedItems.update(id, { ...data, updatedAt: now() });
          if (!changed) throw new Error('This connection no longer exists.');
        });
      });
    },

    async remove(id: string): Promise<void> {
      session.assert(CAPABILITIES.manage);
      await environment.run('integrations.delete', async () => {
        await db.transaction('rw', db.connectedItems, async () => {
          if (!(await db.connectedItems.get(id)))
            throw new Error('This connection no longer exists.');
          await db.connectedItems.delete(id);
        });
      });
    },

    async setSyncState(id: string, syncState: SyncState): Promise<void> {
      session.assert(CAPABILITIES.manage);
      if (syncState !== 'active' && syncState !== 'paused') throw new Error('Choose a sync state.');
      await environment.run('integrations.sync-state', async () => {
        await db.transaction('rw', db.connectedItems, async () => {
          const changed = await db.connectedItems.update(id, { syncState, updatedAt: now() });
          if (!changed) throw new Error('This connection no longer exists.');
        });
      });
    },

    async connectAccount(provider: Provider, account: string): Promise<ConnectedItem> {
      session.assert(CAPABILITIES.manage);
      const data = parseInput(ConnectedItemInputSchema, {
        label: `${provider} account`,
        provider,
        account,
        syncState: 'active',
      });
      return environment.run('integrations.connect', async () => {
        const at = now();
        const item: ConnectedItem = {
          id: createRuntimeId('integration'),
          ...data,
          connectedAt: at,
          updatedAt: at,
        };
        return db.transaction('rw', db.connectedItems, async () => {
          await db.connectedItems.add(item);
          return item;
        });
      });
    },

    async saveSettings(input: { autoSync: boolean; notifyOnChange: boolean }): Promise<void> {
      session.assert(CAPABILITIES.settings);
      const data = parseInput(SettingsInputSchema, input);
      await environment.run('plugin.settings.update', () =>
        db.transaction('rw', db.settings, () =>
          db.settings.put({ id: 'workspace', ...data, updatedAt: now() })
        )
      );
    },
  };
}

export type PluginServices = ReturnType<typeof createPluginServices>;
