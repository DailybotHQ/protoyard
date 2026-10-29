import { createEntityServices, deriveStores, parseBlueprint } from '@protoyard/blueprint';
import { PermissionDeniedError, type PrototypeRuntime, type Row } from '@protoyard/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import { BUILTIN_THEMES } from '../../themes/src/presets.ts';
import {
  createSettingsServices,
  notificationRulesFor,
  SettingsScreen,
  themeChoices,
} from '../src/screens/settings/index.ts';

const blueprint = parseBlueprint({
  ...helpdeskBlueprint,
  entities: helpdeskBlueprint.entities.map((entity) =>
    entity.name === 'ticket'
      ? { ...entity, features: { ...entity.features, notifications: true } }
      : entity
  ),
  notifications: [
    { on: 'create', entity: 'ticket', notify: 'assignee', title: 'New {subject}' },
    { on: 'update', entity: 'ticket', notify: 'role:admin', title: 'Changed {subject}' },
  ],
});

const ALL = ['profile', 'workspace', 'appearance', 'notifications', 'danger'] as const;

function createDefinition(namespace: string) {
  const definition = createBlueprintDefinition(namespace);
  return {
    ...definition,
    themes: BUILTIN_THEMES.slice(0, 2),
    database: {
      ...definition.database,
      versions: definition.database.versions.map((version, index) =>
        index === 0 ? { ...version, stores: deriveStores(blueprint) } : version
      ),
    },
  };
}

let seq = 0;
let harness = createHarness(createDefinition('crud-settings'));
beforeEach(() => {
  seq += 1;
  harness = createHarness(createDefinition(`crud-settings-${seq}`));
});
afterEach(() => {
  cleanup();
  harness.closeAll();
});

const table = (runtime: PrototypeRuntime, name: string) =>
  (runtime.db as { table(name: string): { toArray(): Promise<Row[]> } }).table(name);

function renderSettings(runtime: PrototypeRuntime, sections: readonly string[] = ALL) {
  return render(SettingsScreen, {
    runtime,
    blueprint,
    sections: sections as never,
    library: [{ id: 'library-demo', name: 'Library demo' }],
  });
}

describe('settings services', () => {
  it('saves the signed-in profile and it survives a reload', async () => {
    const runtime = await harness.boot('owner');
    const services = createSettingsServices(runtime);
    expect(services.canWriteIdentity).toBe(true);
    const saved = await services.updateProfile({
      name: '  Robin Example ',
      avatarColor: '#0f766e',
    });
    expect(saved).toMatchObject({ name: 'Robin Example', avatarColor: '#0f766e' });
    expect(runtime.session.principal()?.persona.name).toBe('Robin Example');

    const reloaded = await harness.reload(runtime);
    expect(reloaded.session.principal()?.persona).toMatchObject({
      name: 'Robin Example',
      avatarColor: '#0f766e',
    });
  });

  it('validates profile and workspace input with field issues', async () => {
    const runtime = await harness.boot('owner');
    const services = createSettingsServices(runtime);
    await expect(services.updateProfile({ name: 'A', avatarColor: 'teal' })).rejects.toMatchObject({
      issues: {
        name: 'Enter at least 2 characters',
        avatarColor: 'Choose a six-digit color such as #4f46e5',
      },
    });
    await expect(services.renameWorkspace({ name: ' ' })).rejects.toMatchObject({
      issues: { name: 'Enter at least 2 characters' },
    });
  });

  it('renames the workspace for owners', async () => {
    const runtime = await harness.boot('owner');
    await createSettingsServices(runtime).renameWorkspace({ name: 'Harbor Example Co' });
    expect(runtime.session.principal()?.organization?.name).toBe('Harbor Example Co');
  });

  it('refuses workspace and reset changes for viewers in the service', async () => {
    const viewer = await harness.boot('viewer');
    expect(viewer.session.principal()?.role).toBe('viewer');
    const services = createSettingsServices(viewer);
    await expect(services.renameWorkspace({ name: 'Nope Example' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await expect(services.resetWorkspaceData()).rejects.toBeInstanceOf(PermissionDeniedError);
    // A viewer still edits their own profile.
    await services.updateProfile({ name: 'Viewer Example', avatarColor: '#334155' });
    expect(viewer.session.principal()?.persona.name).toBe('Viewer Example');
  });

  it('applies appearance through the runtime and refuses unknown themes', async () => {
    const runtime = await harness.boot('owner');
    const services = createSettingsServices(runtime);
    await services.setAppearance({ mode: 'dark' });
    expect(runtime.theme.appearance().mode.value).toBe('dark');
    const theme = runtime.theme.themes().at(-1);
    expect(theme).toBeDefined();
    await services.setAppearance({ themeId: theme?.id as string });
    expect(runtime.theme.appearance().theme.value).toBe(theme?.id);
    await expect(services.setAppearance({ themeId: 'no-such-theme' })).rejects.toMatchObject({
      issues: { themeId: 'That theme is not available.' },
    });
  });

  it('resets workspace data to the scenario seed', async () => {
    const runtime = await harness.boot('owner');
    const entities = createEntityServices(runtime, blueprint);
    const before = (await entities.customer!.list()).length;
    await entities.customer!.create({ name: 'Temporary Example' });
    expect(await entities.customer!.list()).toHaveLength(before + 1);
    await createSettingsServices(runtime).resetWorkspaceData();
    expect(await entities.customer!.list()).toHaveLength(before);
  });
});

describe('settings helpers', () => {
  it('lists registered themes first, then library choices not yet registered', () => {
    expect(
      themeChoices(
        [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
        [
          { id: 'b', name: 'B again' },
          { id: 'c', name: 'C' },
        ]
      )
    ).toEqual([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ]);
  });

  it('describes only the notification rules that reach a role', () => {
    expect(notificationRulesFor(blueprint, 'member').map((r) => r.description)).toEqual([
      'When a ticket assigned to you is created',
    ]);
    expect(notificationRulesFor(blueprint, 'admin')).toHaveLength(2);
  });
});

describe('SettingsScreen', () => {
  it('saves the profile from the form with pending feedback and shows field errors', async () => {
    const runtime = await harness.boot('owner');
    renderSettings(runtime);
    const name = (await screen.findByTestId('settings-profile-name')) as HTMLInputElement;
    const save = screen.getByTestId('settings-profile-save') as HTMLButtonElement;
    expect(save.disabled).toBe(true); // nothing changed yet

    await fireEvent.input(name, { target: { value: 'X' } });
    await fireEvent.click(save);
    await waitFor(() => expect(screen.getByText('Enter at least 2 characters')).toBeTruthy());

    await fireEvent.input(name, { target: { value: 'Morgan Example' } });
    await fireEvent.click(save);
    await waitFor(() => expect(runtime.session.principal()?.persona.name).toBe('Morgan Example'));
    const personas = await table(runtime, 'py_personas').toArray();
    expect(personas.some((p) => p.name === 'Morgan Example')).toBe(true);
  });

  it('shows the signed-in persona face on the profile, named by its alt', async () => {
    const runtime = await harness.boot('owner');
    const persona = runtime.session.principal()?.persona;
    expect(persona?.avatar).toMatch(/^av-\d{3}$/);
    renderSettings(runtime);
    const avatar = await screen.findByTestId('settings-profile-avatar');
    const face = avatar.querySelector('img');
    expect(face?.getAttribute('src')).toBe(`./avatars/64/${persona?.avatar}.webp`);
    // Texuli's Avatar names its root (role=img); the image itself is decorative.
    expect(face?.closest('[role="img"]')?.getAttribute('aria-label')).toBe(persona?.name);
  });

  it('renames the workspace from the form for an owner', async () => {
    const runtime = await harness.boot('owner');
    renderSettings(runtime);
    await fireEvent.input(await screen.findByTestId('settings-workspace-name'), {
      target: { value: 'Lantern Example Studio' },
    });
    await fireEvent.click(screen.getByTestId('settings-workspace-save'));
    await waitFor(() =>
      expect(runtime.session.principal()?.organization?.name).toBe('Lantern Example Studio')
    );
  });

  it('shows the viewer read-only workspace and danger zone, with no edit controls', async () => {
    const runtime = await harness.boot('viewer');
    renderSettings(runtime);
    expect(await screen.findByTestId('settings-workspace-readonly')).toBeTruthy();
    expect(screen.queryByTestId('settings-workspace-name')).toBeNull();
    expect(screen.queryByTestId('settings-workspace-save')).toBeNull();
    expect(screen.getByTestId('settings-danger-readonly')).toBeTruthy();
    expect(screen.queryByTestId('settings-reset')).toBeNull();
  });

  it('lists theme choices including the library and shows the current mode', async () => {
    const runtime = await harness.boot('owner');
    await runtime.theme.setPreference({ mode: 'dark' });
    renderSettings(runtime);
    const section = await screen.findByTestId('settings-appearance');
    expect(section.textContent).toContain('Dark');
    expect(screen.getByTestId('settings-theme')).toBeTruthy();
  });

  it('marks notifications read and lists the rules that reach you', async () => {
    const runtime = await harness.boot('owner');
    const actorId = runtime.session.principal()?.persona.id as string;
    const personas = await table(runtime, 'py_personas').toArray();
    const otherId = personas.find((p) => p.id !== actorId)?.id as string;
    // Someone else assigns a ticket to the owner, so the owner gets a notification.
    await runtime.session.switchActor(otherId);
    const customers = await table(runtime, 'customers').toArray();
    await createEntityServices(runtime, blueprint).ticket!.create({
      subject: 'Badge reader offline',
      customerId: String(customers[0]?.id),
      assigneeId: actorId,
    });
    await runtime.session.switchActor(actorId);

    renderSettings(runtime);
    expect((await screen.findByTestId('settings-notification-rules')).textContent).toContain(
      'When a ticket assigned to you is created'
    );
    await waitFor(() =>
      expect(screen.getByTestId('settings-unread').textContent).toMatch(/^\s*[1-9]\d* unread/)
    );
    await fireEvent.click(screen.getByTestId('settings-mark-all-read'));
    await waitFor(() =>
      expect(screen.getByTestId('settings-unread').textContent).toMatch(/0 unread/)
    );
  });

  it('resets data only after the confirmation dialog', async () => {
    const runtime = await harness.boot('owner');
    const entities = createEntityServices(runtime, blueprint);
    const before = (await entities.customer!.list()).length;
    await entities.customer!.create({ name: 'Scratch Example' });
    renderSettings(runtime);

    await fireEvent.click(await screen.findByTestId('settings-reset'));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Reset workspace data?');
    // Opening the dialog alone changes nothing.
    expect(await entities.customer!.list()).toHaveLength(before + 1);

    await fireEvent.click(screen.getByRole('button', { name: 'Reset data' }));
    await waitFor(async () => expect(await entities.customer!.list()).toHaveLength(before));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('cancelling the dialog keeps the data', async () => {
    const runtime = await harness.boot('owner');
    const entities = createEntityServices(runtime, blueprint);
    await entities.customer!.create({ name: 'Keeper Example' });
    const count = (await entities.customer!.list()).length;
    renderSettings(runtime);
    await fireEvent.click(await screen.findByTestId('settings-reset'));
    await screen.findByRole('alertdialog');
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(await entities.customer!.list()).toHaveLength(count);
  });

  it('renders only the declared sections', async () => {
    const runtime = await harness.boot('owner');
    renderSettings(runtime, ['appearance']);
    expect(await screen.findByTestId('settings-appearance')).toBeTruthy();
    for (const id of ['profile', 'workspace', 'notifications', 'danger']) {
      expect(screen.queryByTestId(`settings-${id}`)).toBeNull();
    }
  });
});
