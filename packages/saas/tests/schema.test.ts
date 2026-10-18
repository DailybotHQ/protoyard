import { definePrototype, type PrototypeDefinition, parseManifest } from '@protoyard/core';
import { createPrototypeRuntime, type ProtoyardRuntime } from '@protoyard/runtime';
import {
  createGenerateContext,
  generateTeam,
  PRESETS,
  resolveScenarios,
  validateWorld,
} from '@protoyard/scenarios';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import {
  mergeIntegrity,
  SAAS_ROW_SCHEMAS,
  SAAS_TABLE_NAMES,
  type SaasAccount,
  SaasInboxMessageSchema,
  type SaasInvitation,
  SaasSubscriptionSchema,
  saasIntegrity,
  saasStores,
  saasTables,
} from '../src/index.ts';

const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';

describe('saasStores', () => {
  it('returns a Dexie store for every kit table by default', () => {
    const stores = saasStores();
    expect(Object.keys(stores)).toEqual([...SAAS_TABLE_NAMES]);
    expect(stores.saas_accounts).toBe('id, &email, personaId');
    for (const store of Object.values(stores)) expect(store.startsWith('id')).toBe(true);
  });

  it('selects a subset and rejects unknown tables and layout versions', () => {
    expect(Object.keys(saasStores(1, { tables: ['saas_accounts', 'saas_inbox'] }))).toEqual([
      'saas_accounts',
      'saas_inbox',
    ]);
    expect(() => saasStores(2)).toThrow(/Unknown SaaS kit layout version 2/);
    // @ts-expect-error — not a kit table
    expect(() => saasStores(1, { tables: ['deals'] })).toThrow(/Unknown SaaS kit table "deals"/);
  });
});

describe('saasTables', () => {
  it('fills empty arrays for every selected table and keeps given rows', () => {
    const tables = saasTables({ saas_inbox: [] }, { tables: ['saas_accounts', 'saas_inbox'] });
    expect(tables).toEqual({ saas_accounts: [], saas_inbox: [] });
  });

  it('refuses rows for a table that was not selected', () => {
    expect(() => saasTables({ saas_mfa: [] }, { tables: ['saas_accounts'] })).toThrow(
      /not a selected kit table/
    );
  });
});

describe('saasIntegrity and mergeIntegrity', () => {
  it('drops relations to kit tables that were not selected', () => {
    const rules = saasIntegrity({ tables: ['saas_invitations'] });
    expect(rules.relations?.saas_invitations).toEqual({
      organizationId: 'py_organizations',
      invitedBy: 'py_personas',
      acceptedBy: 'py_personas',
    });
    expect(rules.timestamps?.saas_invitations).toEqual(['createdAt', 'acceptedAt']);
  });

  it('never checks future-dated columns as past timestamps', () => {
    const rules = saasIntegrity();
    expect(rules.timestamps?.saas_tokens).not.toContain('expiresAt');
    expect(rules.timestamps?.saas_subscriptions).not.toContain('trialEndsAt');
    expect(rules.timestamps?.saas_subscriptions).not.toContain('currentPeriodEnd');
  });

  it('merges relations per field and unions timestamp columns', () => {
    const merged = mergeIntegrity(
      { relations: { deals: { ownerId: 'py_personas' } }, timestamps: { deals: ['createdAt'] } },
      undefined,
      {
        relations: { deals: { companyId: 'companies' } },
        timestamps: { deals: ['createdAt', 'closedAt'] },
      }
    );
    expect(merged.relations?.deals).toEqual({ ownerId: 'py_personas', companyId: 'companies' });
    expect(merged.timestamps?.deals).toEqual(['createdAt', 'closedAt']);
  });
});

describe('row schemas', () => {
  it('apply defaults so generators only write what matters', () => {
    const subscription = SaasSubscriptionSchema.parse({
      id: 'sub_0001',
      organizationId: 'org_0001',
      planId: 'pro',
      status: 'trialing',
      unitAmountCents: 1200,
      currentPeriodStart: '2026-05-20T00:00:00.000Z',
      currentPeriodEnd: '2026-06-20T00:00:00.000Z',
      createdAt: '2026-05-20T00:00:00.000Z',
    });
    expect(subscription).toMatchObject({ seats: 1, currency: 'USD', cancelAtPeriodEnd: false });
    expect(subscription.trialEndsAt).toBeNull();
  });

  it('reject fractional money and off-origin inbox links', () => {
    expect(
      SaasSubscriptionSchema.safeParse({
        id: 's',
        organizationId: 'o',
        planId: 'pro',
        status: 'active',
        unitAmountCents: 12.5,
        currentPeriodStart: REFERENCE_TIME,
        currentPeriodEnd: REFERENCE_TIME,
        createdAt: REFERENCE_TIME,
      }).success
    ).toBe(false);
    const message = {
      id: 'msg_1',
      recipient: 'ada@example.com',
      kind: 'magic-link',
      subject: 'Your sign-in link',
      body: 'Open the link to sign in.',
      at: REFERENCE_TIME,
    };
    expect(
      SaasInboxMessageSchema.safeParse({
        ...message,
        action: { label: 'Sign in', href: '#/magic/tok_1' },
      }).success
    ).toBe(true);
    for (const href of ['https://evil.example/', 'javascript:alert(1)', '#/a b']) {
      expect(
        SaasInboxMessageSchema.safeParse({ ...message, action: { label: 'Sign in', href } }).success
      ).toBe(false);
    }
  });

  it('cover every kit table', () => {
    expect(Object.keys(SAAS_ROW_SCHEMAS)).toEqual([...SAAS_TABLE_NAMES]);
  });
});

/** A minimal prototype that opts into the whole kit on top of its own table. */
function createSaasDefinition(namespace: string): PrototypeDefinition {
  return definePrototype({
    manifest: parseManifest({
      id: `example.${namespace}`,
      slug: namespace,
      name: 'SaaS kit fixture',
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
      const createdAt = team.organization.createdAt;
      const accounts: SaasAccount[] = team.personas.map((persona) =>
        SAAS_ROW_SCHEMAS.saas_accounts.parse({
          id: ctx.ids.next('acct'),
          personaId: persona.id,
          email: `${persona.id}@example.com`,
          emailVerified: true,
          createdAt: persona.joinedAt,
        })
      );
      const invitation: SaasInvitation = SAAS_ROW_SCHEMAS.saas_invitations.parse({
        id: ctx.ids.next('inv'),
        organizationId: team.organization.id,
        email: 'new.teammate@example.com',
        role: 'member',
        invitedBy: owner.id,
        createdAt,
        expiresAt: ctx.time.daysFromNow(7).toISOString(),
      });
      return {
        organizations: team.organizations,
        personas: team.personas,
        memberships: team.memberships,
        tables: {
          projects: [{ id: ctx.ids.next('project'), organizationId: team.organization.id }],
          ...saasTables({ saas_accounts: accounts, saas_invitations: [invitation] }),
        },
      };
    },
  });
}

const open: ProtoyardRuntime[] = [];
afterEach(() => {
  for (const rt of open.splice(0)) rt.close();
});

describe('a prototype that opts into the kit', () => {
  it('seeds kit tables with zero integrity violations and keeps them across a reload', async () => {
    const definition = createSaasDefinition('saas-kit-fixture');
    const indexedDB = new IDBFactory() as unknown as globalThis.IDBFactory;
    const boot = async () => {
      const runtime = await createPrototypeRuntime(definition, { indexedDB, IDBKeyRange });
      open.push(runtime);
      return runtime;
    };

    const runtime = await boot();
    await runtime.scenarios.ensureSeeded();
    const accounts = await runtime.db.rows<SaasAccount>('saas_accounts').toArray();
    expect(accounts.length).toBe(runtime.session.personas().length);
    expect(await runtime.db.rows('saas_invitations').count()).toBe(1);
    expect(await runtime.db.rows('saas_inbox').count()).toBe(0);
    runtime.close();

    const reopened = await boot();
    expect(await reopened.db.rows('saas_accounts').count()).toBe(accounts.length);
  });

  it('flags a kit row that points at a missing persona', async () => {
    const definition = createSaasDefinition('saas-kit-broken');
    const [scenario] = resolveScenarios(definition.scenarios, PRESETS);
    if (!scenario) throw new Error('fixture has no scenario');
    const seed = await definition.generate(createGenerateContext(scenario));
    const broken = {
      ...seed,
      tables: {
        ...seed.tables,
        saas_accounts: [{ ...(seed.tables.saas_accounts?.[0] ?? {}), personaId: 'ghost' }],
      },
    } as typeof seed;
    const violations = validateWorld(broken, {
      ...definition.integrity,
      referenceTime: REFERENCE_TIME,
    });
    expect(violations).toContainEqual(
      expect.objectContaining({ table: 'saas_accounts', field: 'personaId' })
    );
  });
});
