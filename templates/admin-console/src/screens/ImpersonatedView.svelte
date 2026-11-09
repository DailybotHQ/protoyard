<script lang="ts">
import { liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Notice } from '@protoyard/ui';
import { Heading, Text } from 'texuli/typography';
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
    <Text size="sm" tone="muted">Signed in as</Text>
    <Heading level={1} size="xl">{principal.current?.persona.name}</Heading>
    <Text size="sm" tone="muted">
      {ROLE_LABELS[principal.current?.role ?? ''] ?? principal.current?.role} at {principal.current?.organization?.name}
    </Text>
  </div>
  <Card>
    <CardHeader>
      <CardTitle>{tenant.current?.name ?? 'Workspace'}</CardTitle>
      <CardDescription>The workspace exactly as this person sees it.</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-2">
      {#if tenant.current?.status === 'suspended'}
        <Notice tone="error" text="This workspace is suspended. Contact support to restore access." />
      {/if}
      <div class="flex items-center justify-between"><Text as="span" size="sm">Workspace status</Text><StatusBadge status={tenant.current?.status ?? 'active'} /></div>
      <div class="flex items-center justify-between"><Text as="span" size="sm">Plan</Text><Text as="span" size="sm" transform="capitalize">{tenant.current?.plan}</Text></div>
      <div class="flex items-center justify-between"><Text as="span" size="sm">Email</Text><Text as="span" size="sm">{principal.current?.persona.email}</Text></div>
    </CardContent>
  </Card>
</main>
