import {
  definePolicy,
  definePrototype,
  type PrototypeDefinition,
  parseManifest,
  SimulatedServiceError,
  ValidationError,
} from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { generateTeam, PRESETS } from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { createWorkspaces, WORKSPACE_CAPABILITIES } from '../src/workspaces.ts';

const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';

function createWorkspacesDefinition(namespace: string): PrototypeDefinition {
  return definePrototype({
    manifest: parseManifest({
      id: `example.${namespace}`,
      slug: namespace,
      name: 'SaaS workspaces fixture',
      version: '0.1.0',
      defaultScenario: 'active-month',
      defaultTheme: 'violet',
      storage: { namespace, schemaVersion: 1 },
      scenarios: ['active-month', 'viewer'],
    }),
    database: {
      versions: [
        {
          version: 1,
          stores: { projects: 'id, organizationId' },
        },
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
      {
        id: 'viewer',
        extends: 'read-only-viewer',
        name: 'Viewer',
        seed: 7,
        referenceTime: REFERENCE_TIME,
      },
    ],
    policy: definePolicy({
      roles: {
        owner: ['*'],
        admin: ['*', WORKSPACE_CAPABILITIES.create, WORKSPACE_CAPABILITIES.rename],
        member: [WORKSPACE_CAPABILITIES.create, WORKSPACE_CAPABILITIES.leave],
        viewer: [],
      },
    }),
    integrity: {
      relations: { projects: { organizationId: 'py_organizations' } },
    },
    generate(ctx) {
      const team = generateTeam(ctx);
      return {
        organizations: team.organizations,
        personas: team.personas,
        memberships: team.memberships,
        tables: {
          projects: [
            {
              id: ctx.ids.next('project'),
              organizationId: team.organization.id,
            },
          ],
        },
      };
    },
  });
}

type Db = ProtoyardRuntime['db'];
const harnesses: ReturnType<typeof createHarness<Db>>[] = [];

afterEach(() => {
  for (const h of harnesses.splice(0)) h.closeAll();
});

async function boot(namespace: string, scenario = 'active-month') {
  const harness = createHarness<Db>(createWorkspacesDefinition(namespace));
  harnesses.push(harness);
  const runtime = await harness.boot(scenario);
  return { harness, runtime, workspaces: createWorkspaces(runtime) };
}

describe('createWorkspaces', () => {
  it('creates a workspace, switches to it, and keeps it active across reload', async () => {
    const { harness, runtime, workspaces } = await boot('saas-ws-persist');
    const before = runtime.session.principal()?.organization?.id;
    expect(before).toBeTruthy();

    const created = await workspaces.create({ name: 'Acme Labs', type: 'company' });
    expect(created.organization.id).toMatch(/^org_u/);
    expect(created.organization.name).toBe('Acme Labs');
    expect(created.membership.role).toBe('owner');
    expect(created.membership.personaId).toBe(runtime.session.principal()?.persona.id);
    expect(runtime.session.principal()?.organization?.id).toBe(created.organization.id);
    expect(runtime.session.principal()?.role).toBe('owner');
    expect(workspaces.list().some((w) => w.organization.id === created.organization.id)).toBe(true);

    const reloaded = await harness.reload(runtime);
    const again = createWorkspaces(reloaded);
    expect(reloaded.session.principal()?.organization?.id).toBe(created.organization.id);
    expect(reloaded.session.principal()?.organization?.name).toBe('Acme Labs');
    expect(again.list().map((w) => w.organization.id)).toContain(created.organization.id);
    // Seeded org is still a membership.
    expect(again.list().some((w) => w.organization.id === before)).toBe(true);
  });

  it('switches between workspaces the persona belongs to', async () => {
    const { runtime, workspaces } = await boot('saas-ws-switch');
    const original = runtime.session.principal()?.organization?.id as string;
    const created = await workspaces.create({ name: 'Second Space' });

    await workspaces.switchTo(original);
    expect(runtime.session.principal()?.organization?.id).toBe(original);

    await workspaces.switchTo(created.organization.id);
    expect(runtime.session.principal()?.organization?.id).toBe(created.organization.id);

    await expect(workspaces.switchTo('org_missing')).rejects.toMatchObject({
      name: 'ValidationError',
      issues: { organizationId: expect.stringMatching(/not a member/i) },
    });
  });

  it('renames a workspace the persona belongs to', async () => {
    const { runtime, workspaces } = await boot('saas-ws-rename');
    const created = await workspaces.create({ name: 'Old Name' });
    const renamed = await workspaces.rename(created.organization.id, { name: 'New Name' });
    expect(renamed.name).toBe('New Name');
    expect(runtime.session.principal()?.organization?.name).toBe('New Name');
  });

  it('denies leave when the actor is the last owner', async () => {
    const { runtime, workspaces } = await boot('saas-ws-last-owner');
    const created = await workspaces.create({ name: 'Solo Co' });
    expect(runtime.session.principal()?.organization?.id).toBe(created.organization.id);

    await expect(workspaces.leave(created.organization.id)).rejects.toMatchObject({
      name: 'ValidationError',
      issues: { membership: expect.stringMatching(/at least one owner/i) },
    });
    expect(runtime.session.principal()?.organization?.id).toBe(created.organization.id);
    expect(workspaces.list().some((w) => w.organization.id === created.organization.id)).toBe(true);
  });

  it('leaves after transferring ownership and switches back to another org', async () => {
    const { runtime, workspaces } = await boot('saas-ws-leave');
    const original = runtime.session.principal()?.organization?.id as string;
    const created = await workspaces.create({ name: 'Shared Co' });

    const teammate = await runtime.members.invite({
      name: 'Blair Example',
      role: 'member',
      email: 'blair@example.com',
    });
    await workspaces.transferOwnership(teammate.membership.id, { formerOwnerRole: 'admin' });
    expect(
      runtime.members
        .list(created.organization.id)
        .find((m) => m.membership.id === teammate.membership.id)?.membership.role
    ).toBe('owner');
    expect(runtime.session.principal()?.role).toBe('admin');

    await workspaces.leave(created.organization.id);
    expect(workspaces.list().some((w) => w.organization.id === created.organization.id)).toBe(
      false
    );
    expect(runtime.session.principal()?.organization?.id).toBe(original);
  });

  it('writes nothing when create runs offline', async () => {
    const { runtime, workspaces } = await boot('saas-ws-offline');
    const beforeOrgs = runtime.session.organizations().length;
    runtime.environment.set({ network: 'offline' });

    await expect(workspaces.create({ name: 'Offline Co' })).rejects.toBeInstanceOf(
      SimulatedServiceError
    );
    await expect(workspaces.create({ name: 'Offline Co' })).rejects.toMatchObject({
      code: 'offline',
      operation: 'workspaces.create',
    });

    expect(runtime.session.organizations()).toHaveLength(beforeOrgs);
  });

  it('rejects empty names and viewers without create capability', async () => {
    const { runtime, workspaces } = await boot('saas-ws-validate');
    await expect(workspaces.create({ name: 'x' })).rejects.toBeInstanceOf(ValidationError);

    const viewerBoot = await boot('saas-ws-viewer', 'viewer');
    expect(viewerBoot.runtime.session.principal()?.role).toBe('viewer');
    await expect(viewerBoot.workspaces.create({ name: 'No Access' })).rejects.toThrow(
      /permission|denied|workspaces:create/i
    );
    void runtime;
  });
});

void PRESETS;
