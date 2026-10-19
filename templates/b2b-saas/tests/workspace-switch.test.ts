import type { ProtoyardRuntime } from '@protoyard/runtime';
import { createWorkspaces, type WorkspacesRuntime } from '@protoyard/saas';
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { definition } from '../src/prototype.ts';
import Projects from '../src/screens/Projects.svelte';
import ScreenHarness from './fixtures/ScreenHarness.svelte';

let harness = createHarness(definition);
afterEach(() => {
  cleanup();
  harness.closeAll();
  harness = createHarness(definition);
  location.hash = '';
});

describe('Projects screen', () => {
  it('follows a workspace switch (the reactive principal re-runs the query)', async () => {
    const runtime = (await harness.boot('active')) as unknown as ProtoyardRuntime;
    await runtime.session.signIn('user_0001');
    const primary = runtime.session.principal()?.organization?.id;
    if (!primary) throw new Error('The active scenario needs an organization');
    const other = createWorkspaces(runtime as unknown as WorkspacesRuntime)
      .list()
      .find((workspace) => workspace.organization.id !== primary);
    if (!other) throw new Error('The active scenario needs a second workspace');
    const seeded = await runtime.db
      .table<{ name: string }>('projects')
      .where('organizationId')
      .equals(primary)
      .toArray();
    expect(seeded.length).toBeGreaterThan(0);
    const firstName = seeded[0]?.name ?? '';

    render(ScreenHarness, { runtime, view: Projects });
    await screen.findByRole('heading', { level: 2, name: firstName });

    await runtime.session.switchOrganization(other.organization.id);
    await screen.findByText('No projects yet. Create the first one above.');
    expect(screen.queryByRole('heading', { level: 2, name: firstName })).toBeNull();

    await runtime.session.switchOrganization(primary);
    await screen.findByRole('heading', { level: 2, name: firstName });
  });
});
