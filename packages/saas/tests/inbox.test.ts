import {
  definePrototype,
  type PrototypeDefinition,
  parseManifest,
  SimulatedServiceError,
} from '@protoyard/core';
import { createPrototypeRuntime, type ProtoyardRuntime } from '@protoyard/runtime';
import { generateTeam, PRESETS } from '@protoyard/scenarios';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { createInbox } from '../src/inbox.ts';
import {
  mergeIntegrity,
  SAAS_ROW_SCHEMAS,
  type SaasAccount,
  type SaasInboxMessage,
  saasIntegrity,
  saasStores,
  saasTables,
} from '../src/index.ts';

const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';

function createInboxDefinition(namespace: string): PrototypeDefinition {
  return definePrototype({
    manifest: parseManifest({
      id: `example.${namespace}`,
      slug: namespace,
      name: 'SaaS inbox fixture',
      version: '0.1.0',
      defaultScenario: 'active-month',
      defaultTheme: 'violet',
      storage: { namespace, schemaVersion: 2 },
      scenarios: ['active-month'],
    }),
    database: {
      versions: [
        { version: 1, stores: { projects: 'id, organizationId' } },
        { version: 2, stores: saasStores() },
      ],
    },
    scenarios: [
      {
        id: 'active-month',
        extends: 'active-month',
        name: 'Active month',
        seed: 42,
        referenceTime: REFERENCE_TIME,
      },
    ],
    integrity: mergeIntegrity(
      { relations: { projects: { organizationId: 'py_organizations' } } },
      saasIntegrity()
    ),
    generate(ctx) {
      const team = generateTeam(ctx);
      const owner = team.personas[0];
      if (!owner) throw new Error('generateTeam returned no personas');
      const accounts: SaasAccount[] = team.personas.map((persona) =>
        SAAS_ROW_SCHEMAS.saas_accounts.parse({
          id: ctx.ids.next('acct'),
          personaId: persona.id,
          email: `${persona.id}@example.com`,
          emailVerified: true,
          createdAt: persona.joinedAt,
        })
      );
      return {
        organizations: team.organizations,
        personas: team.personas,
        memberships: team.memberships,
        tables: {
          projects: [{ id: ctx.ids.next('project'), organizationId: team.organization.id }],
          ...saasTables({ saas_accounts: accounts }),
        },
      };
    },
  });
}

const open: ProtoyardRuntime[] = [];
afterEach(() => {
  for (const rt of open.splice(0)) rt.close();
});

function harness(namespace: string) {
  const definition = createInboxDefinition(namespace);
  const indexedDB = new IDBFactory() as unknown as globalThis.IDBFactory;
  const boot = async () => {
    const runtime = await createPrototypeRuntime(definition, {
      indexedDB,
      IDBKeyRange,
      sleep: async () => {},
    });
    open.push(runtime);
    await runtime.scenarios.ensureSeeded();
    return runtime;
  };
  return {
    boot,
    async reload(runtime: ProtoyardRuntime) {
      runtime.close();
      return boot();
    },
  };
}

describe('createInbox', () => {
  it('delivers a message that persists across reload', async () => {
    const h = harness('saas-inbox-persist');
    const runtime = await h.boot();
    const inbox = createInbox(runtime);
    const persona = runtime.session.personas()[0];
    if (!persona) throw new Error('no persona');

    const delivered = await inbox.deliver({
      recipient: 'ada@example.com',
      personaId: persona.id,
      kind: 'magic-link',
      subject: 'Sign in to Acme',
      body: 'Use the button below to finish signing in (simulated).',
      action: { label: 'Sign in', href: '#/auth/magic?token=demo' },
    });

    expect(delivered.id).toMatch(/^inbox_u/);
    expect(delivered.at).toBe(REFERENCE_TIME);
    expect(delivered.readAt).toBeNull();
    expect(delivered.archivedAt).toBeNull();
    expect(delivered.action).toEqual({ label: 'Sign in', href: '#/auth/magic?token=demo' });
    expect(await runtime.db.rows<SaasInboxMessage>('saas_inbox').count()).toBe(1);

    runtime.close();
    const reopened = await h.reload(runtime);
    const again = createInbox(reopened);
    const listed = await again.list({ recipient: 'ada@example.com' });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: delivered.id,
      kind: 'magic-link',
      subject: 'Sign in to Acme',
      body: 'Use the button below to finish signing in (simulated).',
      action: { label: 'Sign in', href: '#/auth/magic?token=demo' },
    });
  });

  it('writes nothing when delivery runs offline', async () => {
    const h = harness('saas-inbox-offline');
    const runtime = await h.boot();
    const inbox = createInbox(runtime);
    runtime.environment.set({ network: 'offline' });

    await expect(
      inbox.deliver({
        recipient: 'bob@example.com',
        kind: 'verify-email',
        subject: 'Verify your email',
        body: 'Confirm bob@example.com (simulated).',
        action: { label: 'Verify', href: '#/auth/verify?token=x' },
      })
    ).rejects.toBeInstanceOf(SimulatedServiceError);

    await expect(
      inbox.deliver({
        recipient: 'bob@example.com',
        kind: 'verify-email',
        subject: 'Verify your email',
        body: 'Confirm bob@example.com (simulated).',
        action: { label: 'Verify', href: '#/auth/verify?token=x' },
      })
    ).rejects.toMatchObject({ code: 'offline', operation: 'inbox.deliver' });

    expect(await runtime.db.rows('saas_inbox').count()).toBe(0);
    expect(await inbox.list()).toEqual([]);
  });

  it('rejects off-origin actions and never writes them', async () => {
    const h = harness('saas-inbox-href');
    const runtime = await h.boot();
    const inbox = createInbox(runtime);

    await expect(
      inbox.deliver({
        recipient: 'cara@example.com',
        kind: 'notification',
        subject: 'Hello',
        body: 'Nope',
        action: { label: 'Open', href: 'https://evil.example/phish' },
      })
    ).rejects.toMatchObject({ name: 'ValidationError' });

    expect(await runtime.db.rows('saas_inbox').count()).toBe(0);
  });

  it('lists with filters, markRead and archive; write joins an outer transaction', async () => {
    const h = harness('saas-inbox-ops');
    const runtime = await h.boot();
    const inbox = createInbox(runtime);
    const persona = runtime.session.personas()[0];
    if (!persona) throw new Error('no persona');

    const older = await inbox.deliver({
      recipient: 'dana@example.com',
      personaId: persona.id,
      kind: 'receipt',
      subject: 'Receipt #1',
      body: 'Thanks for your payment (simulated).',
    });
    // Commit a clock advance so the second message sorts newer by `at`.
    runtime.clock.commitAdvance({ minutes: 5 });
    const newer = await inbox.deliver({
      recipient: 'dana@example.com',
      personaId: persona.id,
      kind: 'invite',
      subject: 'Join the workspace',
      body: 'You were invited (simulated).',
      action: { label: 'Accept', href: '#/invites/accept?id=1' },
    });

    const listed = await inbox.list({ recipient: 'dana@example.com' });
    expect(listed.map((m) => m.id)).toEqual([newer.id, older.id]);
    expect(await inbox.list({ kind: 'invite' })).toHaveLength(1);
    expect(await inbox.list({ unreadOnly: true })).toHaveLength(2);

    const read = await inbox.markRead(older.id);
    expect(read.readAt).toBe(runtime.clock.now().toISOString());
    expect(await inbox.list({ unreadOnly: true })).toHaveLength(1);

    const archived = await inbox.archive(newer.id);
    expect(archived.archivedAt).toBeTruthy();
    expect(archived.readAt).toBeTruthy();
    expect(await inbox.list({ recipient: 'dana@example.com' })).toHaveLength(1);
    expect(await inbox.list({ recipient: 'dana@example.com', includeArchived: true })).toHaveLength(
      2
    );

    // write() participates in the caller's transaction (token + inbox atomicity).
    const db = runtime.db;
    let writtenId = '';
    await db.transaction('rw', db.rows('saas_inbox'), async () => {
      const msg = await inbox.write({
        recipient: 'erin@example.com',
        kind: 'password-reset',
        subject: 'Reset your password',
        body: 'Choose a new password (simulated).',
        action: { label: 'Reset', href: '#/auth/reset?token=y' },
      });
      writtenId = msg.id;
      expect(await db.rows('saas_inbox').get(msg.id)).toBeTruthy();
    });
    expect(await inbox.get(writtenId)).toMatchObject({
      kind: 'password-reset',
      recipient: 'erin@example.com',
    });
  });

  it('covers every inbox kind with plain text bodies', async () => {
    const h = harness('saas-inbox-kinds');
    const runtime = await h.boot();
    const inbox = createInbox(runtime);
    const kinds = [
      'verify-email',
      'magic-link',
      'password-reset',
      'invite',
      'receipt',
      'trial',
      'notification',
    ] as const;

    for (const kind of kinds) {
      await inbox.deliver({
        recipient: `${kind}@example.com`,
        kind,
        subject: `Subject ${kind}`,
        body: `Body for ${kind}`,
        action: { label: 'Open', href: `#/inbox/${kind}` },
      });
    }
    expect(await runtime.db.rows('saas_inbox').count()).toBe(kinds.length);
    for (const kind of kinds) {
      const [row] = await inbox.list({ kind });
      expect(row?.body).toBe(`Body for ${kind}`);
      expect(row?.action?.href.startsWith('#/')).toBe(true);
    }
  });
});

// PRESETS import keeps the scenarios package linked the same way as schema tests.
void PRESETS;
