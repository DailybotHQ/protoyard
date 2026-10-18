import {
  definePolicy,
  definePrototype,
  type PrototypeDefinition,
  parseManifest,
} from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { createWorkspaces, WORKSPACE_CAPABILITIES, type WorkspacesRuntime } from '@protoyard/saas';
import { generateTeam } from '@protoyard/scenarios';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import WorkspaceSwitcherHarness from './fixtures/WorkspaceSwitcherHarness.svelte';

const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';

function createDefinition(namespace: string): PrototypeDefinition {
  return definePrototype({
    manifest: parseManifest({
      id: `example.${namespace}`,
      slug: namespace,
      name: 'Workspace switcher fixture',
      version: '0.1.0',
      defaultScenario: 'active-month',
      defaultTheme: 'violet',
      storage: { namespace, schemaVersion: 1 },
      scenarios: ['active-month'],
    }),
    database: {
      versions: [{ version: 1, stores: { projects: 'id, organizationId' } }],
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
    policy: definePolicy({
      roles: {
        owner: ['*'],
        admin: [WORKSPACE_CAPABILITIES.create, WORKSPACE_CAPABILITIES.rename],
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
          projects: [{ id: ctx.ids.next('project'), organizationId: team.organization.id }],
        },
      };
    },
  });
}

type Db = ProtoyardRuntime['db'];
const harnesses: ReturnType<typeof createHarness<Db>>[] = [];

afterEach(() => {
  cleanup();
  for (const h of harnesses.splice(0)) h.closeAll();
});

async function boot(namespace: string) {
  const harness = createHarness<Db>(createDefinition(namespace));
  harnesses.push(harness);
  const runtime = (await harness.boot('active-month')) as ProtoyardRuntime;
  const workspaces = createWorkspaces(runtime as WorkspacesRuntime);
  return { runtime, workspaces };
}

describe('workspace switcher', () => {
  it('switches the principal organization from the dropdown', async () => {
    const { runtime, workspaces } = await boot('saas-ui-ws-switch');
    const original = runtime.session.principal()?.organization;
    expect(original?.id).toBeTruthy();

    const created = await workspaces.create({ name: 'Second Space' });
    expect(runtime.session.principal()?.organization?.id).toBe(created.organization.id);

    render(WorkspaceSwitcherHarness, { runtime, workspaces });
    expect(screen.getByTestId('active-org-id').textContent).toBe(created.organization.id);
    expect(screen.getByTestId('workspace-switcher-trigger')).toBeTruthy();

    await fireEvent.click(screen.getByTestId('workspace-switcher-trigger'));
    const target = await screen.findByRole('menuitem', { name: original!.name });
    await fireEvent.click(target);

    await waitFor(() => {
      expect(runtime.session.principal()?.organization?.id).toBe(original!.id);
      expect(screen.getByTestId('active-org-id').textContent).toBe(original!.id);
      expect(screen.getByTestId('active-org-name').textContent).toBe(original!.name);
    });
  });

  it('creates a workspace from the dialog and activates it', async () => {
    const { runtime, workspaces } = await boot('saas-ui-ws-create');
    const before = runtime.session.principal()?.organization?.id;
    expect(before).toBeTruthy();

    render(WorkspaceSwitcherHarness, { runtime, workspaces });

    await fireEvent.click(screen.getByTestId('workspace-switcher-trigger'));
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Create workspace' }));

    const nameInput = await screen.findByTestId('workspace-create-name');
    await fireEvent.input(nameInput, { target: { value: 'Acme Labs' } });
    await fireEvent.click(screen.getByTestId('workspace-create-submit'));

    await waitFor(() => {
      expect(runtime.session.principal()?.organization?.name).toBe('Acme Labs');
      expect(screen.getByTestId('active-org-name').textContent).toBe('Acme Labs');
      expect(screen.getByTestId('active-org-id').textContent).not.toBe(before);
    });
    expect(workspaces.list().some((w) => w.organization.name === 'Acme Labs')).toBe(true);
  });

  it('shows the current workspace on the trigger', async () => {
    const { runtime, workspaces } = await boot('saas-ui-ws-label');
    const name = runtime.session.principal()?.organization?.name as string;
    render(WorkspaceSwitcherHarness, { runtime, workspaces });
    expect(screen.getByRole('button', { name: `Workspace: ${name}` })).toBeTruthy();
  });
});
