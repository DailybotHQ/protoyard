import type { ProtoyardRuntime } from '@protoyard/runtime';
import { createWorkspaces, type WorkspacesRuntime } from '@protoyard/saas';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { definition } from '../src/prototype.ts';
import Dashboard from '../src/screens/Dashboard.svelte';
import Projects from '../src/screens/Projects.svelte';
import LatticeHarness from './fixtures/LatticeHarness.svelte';

/**
 * A workspace switch must refresh the screens that scope their reads to the
 * active organization (the list, the counts and the capability checks read
 * the reactive principal, not a one-off `session.principal()`).
 */

let harness = createHarness(definition);
afterEach(() => {
  cleanup();
  harness.closeAll();
  harness = createHarness(definition);
  location.hash = '';
});

async function bootMultiWorkspace() {
  const runtime = (await harness.boot('multi-workspace-admin')) as unknown as ProtoyardRuntime;
  await runtime.session.signIn('user_0001');
  const principal = runtime.session.principal();
  const primary = principal?.organization?.id;
  if (!primary) throw new Error('The multi-workspace scenario needs an active organization');
  const other = createWorkspaces(runtime as unknown as WorkspacesRuntime)
    .list()
    .find((workspace) => workspace.organization.id !== primary);
  if (!other) throw new Error('The multi-workspace scenario needs a second workspace');
  const seeded = await runtime.db.table('projects').where('organizationId').equals(primary).count();
  expect(seeded).toBeGreaterThan(0);
  return { runtime, primary, other: other.organization.id, seeded };
}

describe('workspace switch refreshes organization-scoped screens', () => {
  it('Projects lists the new workspace projects and back again', async () => {
    const { runtime, primary, other, seeded } = await bootMultiWorkspace();
    render(LatticeHarness, { runtime, view: Projects });
    await screen.findByText(`${seeded} projects`);
    expect(screen.getAllByRole('heading', { level: 2, name: /./ }).length).toBeGreaterThan(1);

    await runtime.session.switchOrganization(other);
    await screen.findByText('0 projects');
    expect(screen.getByText('Start with one clear outcome')).toBeTruthy();

    await runtime.session.switchOrganization(primary);
    await screen.findByText(`${seeded} projects`);
  });

  it('Dashboard counts and recent projects follow the active workspace', async () => {
    const { runtime, other } = await bootMultiWorkspace();
    render(LatticeHarness, { runtime, view: Dashboard });
    await screen.findByRole('list');
    const active = () =>
      screen.getByText('Active projects').closest('article')?.querySelector('p')?.textContent;
    expect(Number(active())).toBeGreaterThan(0);

    await runtime.session.switchOrganization(other);
    await screen.findByText('Your portfolio starts here');
    await waitFor(() => expect(active()).toBe('0'));
  });
});
