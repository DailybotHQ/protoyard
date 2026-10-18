<script lang="ts">
import { liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@protoyard/ui';
import StatusBadge from '../components/StatusBadge.svelte';
import { ROLE_LABELS } from '../domain/policy.ts';
import { useAdmin } from '../lib/context.ts';

/**
 * What the impersonated person sees: their workspace, role and access, as
 * the product would show them. Replace this with your product's own home
 * screen; the banner above stays, so staff always know whose session it is.
 */
const { db, impersonation } = useAdmin();
const principal = usePrincipal();
const tenantId = $derived(impersonation.current?.tenantId ?? '');
const tenant = liveQuery(() => db.tenants.get(tenantId), {
  initial: undefined,
  deps: () => tenantId,
});
</script>

<main class="mx-auto grid max-w-3xl gap-6 p-6" data-testid="impersonated-view">
  <div>
    <p class="text-sm text-muted-foreground">Signed in as</p>
    <h1 class="text-2xl font-semibold tracking-tight">{principal.current?.persona.name}</h1>
    <p class="text-sm text-muted-foreground">
      {ROLE_LABELS[principal.current?.role ?? ''] ?? principal.current?.role} at {principal.current?.organization?.name}
    </p>
  </div>
  <Card>
    <CardHeader>
      <CardTitle>{tenant.current?.name ?? 'Workspace'}</CardTitle>
      <CardDescription>The workspace exactly as this person sees it.</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-2 text-sm">
      {#if tenant.current?.status === 'suspended'}
        <p role="alert" class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
          This workspace is suspended. Contact support to restore access.
        </p>
      {/if}
      <div class="flex items-center justify-between"><span>Workspace status</span><StatusBadge status={tenant.current?.status ?? 'active'} /></div>
      <div class="flex items-center justify-between"><span>Plan</span><span class="capitalize">{tenant.current?.plan}</span></div>
      <div class="flex items-center justify-between"><span>Email</span><span>{principal.current?.persona.email}</span></div>
    </CardContent>
  </Card>
</main>
