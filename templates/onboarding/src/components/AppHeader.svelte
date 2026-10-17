<script lang="ts">
import { Compass } from '@lucide/svelte';
import { usePrincipal } from '@protoyard/renderer-svelte';
import { Avatar, Badge } from '@protoyard/ui';
import { ROLE_LABELS } from '../domain/policy.ts';
import { useOnboarding } from '../lib/context.ts';

const principal = usePrincipal();
const { workspace } = useOnboarding();
</script>

<header class="sticky top-0 z-20 border-b border-border bg-background/85 pt-safe backdrop-blur">
  <div class="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
    <a href="#/" class="flex min-w-0 items-center gap-2 rounded-md font-semibold tracking-tight">
      <span class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Compass class="size-4" aria-hidden="true" />
      </span>
      <span class="truncate">{workspace.current?.name ?? principal.current?.organization?.name ?? 'Workspace'}</span>
    </a>
    {#if principal.current}
      <div class="ml-auto flex min-w-0 items-center gap-2.5">
        <div class="hidden min-w-0 text-right sm:block">
          <p class="truncate text-sm font-medium">{principal.current.persona.name}</p>
          <p class="truncate text-xs text-muted-foreground">{principal.current.persona.email}</p>
        </div>
        <Badge variant={principal.current.role === 'viewer' ? 'outline' : 'secondary'}>
          {ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role}
        </Badge>
        <Avatar name={principal.current.persona.name} size="sm" />
      </div>
    {/if}
  </div>
</header>
