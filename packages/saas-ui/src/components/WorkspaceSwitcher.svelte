<script lang="ts">
import { Check, ChevronsUpDown, Plus } from '@lucide/svelte';
import type { PrototypeRuntime } from '@protoyard/core';
import { usePrincipal } from '@protoyard/renderer-svelte';
import { createWorkspaces, type WorkspacesRuntime, type WorkspacesService } from '@protoyard/saas';
import {
  Button,
  Dialog,
  DropdownMenu,
  type DropdownMenuEntry,
  FormField,
  Input,
} from '@protoyard/ui';

interface Props {
  /** Prototype runtime (must expose `identity` for create). */
  runtime: PrototypeRuntime;
  /** Optional pre-built workspaces service (tests). */
  workspaces?: WorkspacesService;
  /** Called after a successful switch. */
  onSwitched?: (organizationId: string) => void;
  /** Called after a workspace is created and activated. */
  onCreated?: (organizationId: string) => void;
  class?: string;
  /** Accessible name for the trigger (default "Workspace"). */
  label?: string;
}

let {
  runtime,
  workspaces: workspacesProp,
  onSwitched,
  onCreated,
  class: className,
  label = 'Workspace',
}: Props = $props();

const workspaces = $derived(workspacesProp ?? createWorkspaces(runtime as WorkspacesRuntime));
const principal = usePrincipal(runtime);

/** Re-read memberships whenever the session principal changes. */
const members = $derived.by(() => {
  void principal.current;
  try {
    return workspaces.list();
  } catch {
    return [];
  }
});

const currentOrg = $derived(principal.current?.organization ?? null);
const currentId = $derived(currentOrg?.id ?? null);
const triggerLabel = $derived(currentOrg?.name ?? 'Select workspace');

let menuOpen = $state(false);
let createOpen = $state(false);
let name = $state('');
let nameError = $state<string | null>(null);
let busy = $state(false);
let formError = $state<string | null>(null);

const menuItems = $derived.by((): DropdownMenuEntry[] => {
  const items: DropdownMenuEntry[] = [{ type: 'label', label: 'Workspaces' }];
  for (const member of members) {
    const id = member.organization.id;
    const active = id === currentId;
    items.push({
      label: member.organization.name,
      icon: active ? Check : undefined,
      disabled: active || busy,
      onSelect: () => {
        void switchTo(id);
      },
    });
  }
  items.push({ type: 'separator' });
  items.push({
    label: 'Create workspace',
    icon: Plus,
    disabled: busy,
    onSelect: () => {
      name = '';
      nameError = null;
      formError = null;
      createOpen = true;
    },
  });
  return items;
});

async function switchTo(organizationId: string): Promise<void> {
  if (organizationId === currentId || busy) return;
  busy = true;
  formError = null;
  try {
    await workspaces.switchTo(organizationId);
    onSwitched?.(organizationId);
  } catch (error) {
    formError = error instanceof Error ? error.message : 'Could not switch workspace.';
  } finally {
    busy = false;
    menuOpen = false;
  }
}

function fieldIssues(error: unknown): Record<string, string> | null {
  if (
    error &&
    typeof error === 'object' &&
    'issues' in error &&
    error.issues &&
    typeof error.issues === 'object'
  ) {
    return error.issues as Record<string, string>;
  }
  return null;
}

async function createWorkspace(): Promise<void> {
  if (busy) return;
  busy = true;
  nameError = null;
  formError = null;
  try {
    const created = await workspaces.create({ name });
    createOpen = false;
    name = '';
    onCreated?.(created.organization.id);
    onSwitched?.(created.organization.id);
  } catch (error) {
    const issues = fieldIssues(error);
    if (issues) {
      nameError = issues.name ?? issues.form ?? null;
      formError = issues.form && !issues.name ? issues.form : null;
    } else {
      formError = error instanceof Error ? error.message : 'Could not create workspace.';
    }
  } finally {
    busy = false;
  }
}
</script>

{#if principal.current}
  <div class={className} data-testid="workspace-switcher">
    <DropdownMenu items={menuItems} bind:open={menuOpen} align="start" class="min-w-56">
      {#snippet trigger({ props })}
        <Button
          {...props}
          type="button"
          variant="outline"
          class="max-w-56 justify-between gap-2 font-normal"
          aria-label={`${label}: ${triggerLabel}`}
          data-testid="workspace-switcher-trigger"
          disabled={busy}
        >
          <span class="truncate">{triggerLabel}</span>
          <ChevronsUpDown class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      {/snippet}
    </DropdownMenu>

    {#if formError && !createOpen}
      <p class="mt-1 text-xs text-destructive" role="alert" data-testid="workspace-switcher-error">
        {formError}
      </p>
    {/if}

    <Dialog
      bind:open={createOpen}
      title="Create workspace"
      description="Start a new simulated organization. You become the owner."
      size="sm"
    >
      <form
        id="workspace-create-form"
        class="grid gap-4"
        onsubmit={(event) => {
          event.preventDefault();
          void createWorkspace();
        }}
      >
        <FormField label="Workspace name" error={nameError} required>
          {#snippet children({ props })}
            <Input
              {...props}
              bind:value={name}
              placeholder="Acme Labs"
              autocomplete="organization"
              data-testid="workspace-create-name"
            />
          {/snippet}
        </FormField>
        {#if formError}
          <p class="text-sm text-destructive" role="alert">{formError}</p>
        {/if}
      </form>
      {#snippet footer()}
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onclick={() => {
            createOpen = false;
          }}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          form="workspace-create-form"
          loading={busy}
          data-testid="workspace-create-submit"
        >
          Create workspace
        </Button>
      {/snippet}
    </Dialog>
  </div>
{/if}
