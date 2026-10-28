<script lang="ts">
import { NotebookPen } from '@lucide/svelte';
import { avatarImage, can, usePrincipal } from '@protoyard/renderer-svelte';
import { Avatar, Badge } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { CAPABILITIES } from '../domain/policy.ts';

const principal = usePrincipal();
const readOnly = $derived(principal.current ? !can(CAPABILITIES.create) : false);
</script>

<header class="sticky top-0 z-20 border-b border-border bg-background/85 pt-safe backdrop-blur">
  <div class="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4 sm:px-6">
    <a href="#/" class="flex items-center gap-2 rounded-md font-semibold tracking-tight">
      <span class="inline-flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <LucideIcon icon={NotebookPen} class="size-4" />
      </span>
      <span>{principal.current?.organization?.name ?? 'Notes'}</span>
    </a>
    <div class="ml-auto flex min-w-0 items-center gap-2.5">
      {#if principal.current}
        {#if readOnly}<Badge variant="secondary">Read-only</Badge>{/if}
        <div class="hidden min-w-0 text-right sm:block">
          <p class="truncate text-sm font-medium">{principal.current.persona.name}</p>
          <p class="truncate text-xs text-muted-foreground">{principal.current.role}</p>
        </div>
        <Avatar name={principal.current.persona.name} {...avatarImage(principal.current.persona.avatar)} size="sm" />
      {/if}
    </div>
  </div>
</header>
