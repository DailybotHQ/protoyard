<script lang="ts">
import {
  type Blueprint,
  type BlueprintNotificationService,
  createNotificationService,
} from '@protoyard/blueprint';
import type { PrototypeRuntime } from '@protoyard/core';
import {
  can,
  isValidationError,
  liveQuery,
  runService,
  useAppearance,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { AlertDialog, Button, FormField, Input, Select } from '@protoyard/ui';
import { createSettingsServices, type SettingsServices, WORKSPACE_CAPABILITY } from './services.ts';
import {
  notificationRulesFor,
  type SettingsSection,
  type ThemeChoice,
  themeChoices,
} from './settings.ts';

/**
 * Generated settings: profile, workspace, appearance, notifications and a
 * danger zone. Every control works on the simulated runtime; role-gated
 * sections render read-only for personas without the right, and services
 * enforce the same rules.
 */
let {
  runtime,
  blueprint,
  sections = ['profile', 'workspace', 'appearance'],
  title = 'Settings',
  library = [],
  services: servicesProp,
  notifications: notificationsProp,
  class: className,
}: {
  runtime: PrototypeRuntime;
  blueprint: Blueprint;
  sections?: readonly SettingsSection[];
  title?: string;
  /** Extra themes to offer (for example the theme library metadata); loaded on demand. */
  library?: readonly ThemeChoice[];
  services?: SettingsServices;
  notifications?: BlueprintNotificationService;
  class?: string;
} = $props();

// svelte-ignore state_referenced_locally
const services = servicesProp ?? createSettingsServices(runtime);
// svelte-ignore state_referenced_locally
const principal = usePrincipal(runtime);
// svelte-ignore state_referenced_locally
const appearance = useAppearance(runtime);
const has = (section: SettingsSection) => sections.includes(section);

const canManageWorkspace = $derived(can(WORKSPACE_CAPABILITY, undefined, runtime));
const persona = $derived(principal.current?.persona ?? null);
const organization = $derived(principal.current?.organization ?? null);

type Issues = Record<string, string>;
const issuesOf = (error: unknown): Issues =>
  isValidationError(error) ? ((error as { issues: Issues }).issues ?? {}) : {};

// Profile
let profileName = $state('');
let profileColor = $state('#4f46e5');
let profileIssues = $state<Issues>({});
$effect(() => {
  profileName = persona?.name ?? '';
  profileColor = persona?.avatarColor ?? '#4f46e5';
});
const profileDirty = $derived(
  persona !== null &&
    (profileName.trim() !== persona.name || profileColor !== (persona.avatarColor ?? '#4f46e5'))
);
async function saveProfile() {
  profileIssues = {};
  const result = await runService(
    () => services.updateProfile({ name: profileName, avatarColor: profileColor }),
    { success: 'Profile saved' }
  );
  if (!result.ok) profileIssues = issuesOf(result.error);
}

// Workspace
let workspaceName = $state('');
let workspaceIssues = $state<Issues>({});
$effect(() => {
  workspaceName = organization?.name ?? '';
});
const workspaceDirty = $derived(
  organization !== null && workspaceName.trim() !== organization.name
);
async function saveWorkspace() {
  workspaceIssues = {};
  const result = await runService(() => services.renameWorkspace({ name: workspaceName }), {
    success: 'Workspace renamed',
  });
  if (!result.ok) workspaceIssues = issuesOf(result.error);
}

// Appearance
const themes = $derived(themeChoices(runtime.theme.themes(), library));
const themeItems = $derived(themes.map((theme) => ({ value: theme.id, label: theme.name })));
const modeItems = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
function chooseTheme(themeId: string) {
  if (!themeId || themeId === appearance.current.theme.value) return;
  void runService(() => services.setAppearance({ themeId }));
}
function chooseMode(mode: string) {
  if (mode === appearance.current.mode.value) return;
  void runService(() => services.setAppearance({ mode: mode as 'light' | 'dark' | 'system' }));
}

// Notifications
const notificationService = $derived(
  notificationsProp ?? (has('notifications') ? createNotificationService(runtime) : null)
);
const rules = $derived(notificationRulesFor(blueprint, principal.current?.role ?? null));
const personaId = $derived(persona?.id ?? null);
const unread = liveQuery(
  async () => (personaId && notificationService ? notificationService.unreadCount() : 0),
  { initial: 0, deps: () => [personaId, notificationService] }
);

// Danger zone
let resetOpen = $state(false);
async function resetData() {
  const result = await runService(() => services.resetWorkspaceData(), {
    success: 'Workspace data reset to the scenario seed',
  });
  if (!result.ok) throw result.error;
}
</script>

<div class={['mx-auto w-full max-w-3xl space-y-6', className]} data-testid="settings-screen">
  <div>
    <h1 class="font-heading text-2xl font-semibold">{title}</h1>
    <p class="mt-1 text-sm text-muted-foreground">
      Simulated settings: changes are stored in this browser only.
    </p>
  </div>

  {#if !persona}
    <p class="rounded-xl border border-border bg-surface p-4 text-sm" data-testid="settings-signed-out">
      Sign in to see your settings.
    </p>
  {:else}
    {#if has('profile')}
      <section
        class="space-y-4 rounded-xl border border-border bg-surface p-4"
        aria-labelledby="settings-profile-title"
        data-testid="settings-profile"
      >
        <div>
          <h2 id="settings-profile-title" class="font-heading text-lg font-semibold">Profile</h2>
          <p class="text-sm text-muted-foreground">How you appear to your team.</p>
        </div>
        {#if services.canWriteIdentity}
          <form
            class="grid gap-4 sm:grid-cols-[1fr_10rem]"
            onsubmit={(event) => event.preventDefault()}
          >
            <FormField label="Display name" required error={profileIssues.name}>
              {#snippet children({ props })}
                <Input {...props} bind:value={profileName} data-testid="settings-profile-name" />
              {/snippet}
            </FormField>
            <FormField label="Avatar color" error={profileIssues.avatarColor}>
              {#snippet children({ props })}
                <Input
                  {...props}
                  type="color"
                  class="h-10 p-1"
                  bind:value={profileColor}
                  data-testid="settings-profile-color"
                />
              {/snippet}
            </FormField>
            <div class="flex items-center gap-3 sm:col-span-2">
              <Button
                type="submit"
                disabled={!profileDirty}
                onclick={() => saveProfile()}
                data-testid="settings-profile-save"
              >
                Save profile
              </Button>
              {#if profileIssues.form}
                <p class="text-sm text-destructive" role="alert">{profileIssues.form}</p>
              {/if}
            </div>
          </form>
        {:else}
          <p class="text-sm" data-testid="settings-profile-readonly">{persona.name}</p>
        {/if}
      </section>
    {/if}

    {#if has('workspace')}
      <section
        class="space-y-4 rounded-xl border border-border bg-surface p-4"
        aria-labelledby="settings-workspace-title"
        data-testid="settings-workspace"
      >
        <div>
          <h2 id="settings-workspace-title" class="font-heading text-lg font-semibold">Workspace</h2>
          <p class="text-sm text-muted-foreground">Shared by everyone in {organization?.name ?? 'this workspace'}.</p>
        </div>
        {#if !organization}
          <p class="text-sm text-muted-foreground">There is no active workspace.</p>
        {:else if canManageWorkspace && services.canWriteIdentity}
          <form class="grid gap-4" onsubmit={(event) => event.preventDefault()}>
            <FormField label="Workspace name" required error={workspaceIssues.name}>
              {#snippet children({ props })}
                <Input {...props} bind:value={workspaceName} data-testid="settings-workspace-name" />
              {/snippet}
            </FormField>
            <div class="flex items-center gap-3">
              <Button
                type="submit"
                disabled={!workspaceDirty}
                onclick={() => saveWorkspace()}
                data-testid="settings-workspace-save"
              >
                Save workspace
              </Button>
              {#if workspaceIssues.form}
                <p class="text-sm text-destructive" role="alert">{workspaceIssues.form}</p>
              {/if}
            </div>
          </form>
        {:else}
          <dl class="grid gap-1 text-sm" data-testid="settings-workspace-readonly">
            <dt class="text-muted-foreground">Workspace name</dt>
            <dd class="font-medium">{organization.name}</dd>
          </dl>
          <p class="text-sm text-muted-foreground">Only owners and admins can change workspace settings (simulated).</p>
        {/if}
      </section>
    {/if}

    {#if has('appearance')}
      <section
        class="space-y-4 rounded-xl border border-border bg-surface p-4"
        aria-labelledby="settings-appearance-title"
        data-testid="settings-appearance"
      >
        <div>
          <h2 id="settings-appearance-title" class="font-heading text-lg font-semibold">Appearance</h2>
          <p class="text-sm text-muted-foreground">Saved for you on this device.</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <FormField label="Theme">
            {#snippet children({ props })}
              <Select
                {...props}
                items={themeItems}
                value={appearance.current.theme.value}
                onValueChange={chooseTheme}
                data-testid="settings-theme"
              />
            {/snippet}
          </FormField>
          <FormField label="Color mode">
            {#snippet children({ props })}
              <Select
                {...props}
                items={modeItems}
                value={appearance.current.mode.value}
                onValueChange={chooseMode}
                data-testid="settings-mode"
              />
            {/snippet}
          </FormField>
        </div>
      </section>
    {/if}

    {#if has('notifications')}
      <section
        class="space-y-4 rounded-xl border border-border bg-surface p-4"
        aria-labelledby="settings-notifications-title"
        data-testid="settings-notifications"
      >
        <div>
          <h2 id="settings-notifications-title" class="font-heading text-lg font-semibold">Notifications</h2>
          <p class="text-sm text-muted-foreground">What notifies you, and your inbox.</p>
        </div>
        {#if rules.length > 0}
          <ul class="space-y-1 text-sm" data-testid="settings-notification-rules">
            {#each rules as rule (rule.key)}
              <li>{rule.description}</li>
            {/each}
          </ul>
        {:else}
          <p class="text-sm text-muted-foreground">No rule notifies your role.</p>
        {/if}
        <div class="flex flex-wrap items-center gap-3">
          <p class="text-sm" data-testid="settings-unread">
            {unread.current} unread
          </p>
          <Button
            variant="outline"
            disabled={unread.current === 0 || !notificationService}
            onclick={() => runService(() => notificationService?.markAllRead(), { success: 'All notifications marked read' })}
            data-testid="settings-mark-all-read"
          >
            Mark all as read
          </Button>
        </div>
      </section>
    {/if}

    {#if has('danger')}
      <section
        class="space-y-4 rounded-xl border border-destructive/40 bg-surface p-4"
        aria-labelledby="settings-danger-title"
        data-testid="settings-danger"
      >
        <div>
          <h2 id="settings-danger-title" class="font-heading text-lg font-semibold">Danger zone</h2>
          <p class="text-sm text-muted-foreground">
            Reset reloads the active scenario from its seed. Every change made in this prototype is lost.
          </p>
        </div>
        {#if canManageWorkspace}
          <AlertDialog
            bind:open={resetOpen}
            title="Reset workspace data?"
            description="All records go back to the scenario seed. This cannot be undone."
            confirmLabel="Reset data"
            destructive
            onConfirm={resetData}
          >
            {#snippet trigger({ props })}
              <Button {...props} variant="destructive" data-testid="settings-reset">Reset workspace data</Button>
            {/snippet}
          </AlertDialog>
        {:else}
          <p class="text-sm text-muted-foreground" data-testid="settings-danger-readonly">
            Only owners and admins can reset workspace data (simulated).
          </p>
        {/if}
      </section>
    {/if}
  {/if}
</div>
