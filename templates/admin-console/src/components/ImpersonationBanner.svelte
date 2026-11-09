<script lang="ts">
import { UserRoundCog } from '@lucide/svelte';
import { navigate, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import { Banner } from 'texuli/alert';
import { LucideIcon } from 'texuli/icons/lucide';
import { useAdmin } from '../lib/context.ts';

/**
 * Always visible while staff impersonate someone: who, for which tenant, and
 * the way back. Impersonation is SIMULATED (the runtime acting persona
 * changes; nothing real is accessed) and every start and stop is audited.
 */
const { services, impersonation, runtime } = useAdmin();
const principal = usePrincipal();
const active = $derived(impersonation.current);
const staffName = $derived(
  active
    ? (runtime.session.personas().find((p) => p.id === active.staffId)?.name ?? active.staffId)
    : ''
);

async function stop() {
  const result = await runService(() => services.impersonation.stop(), {
    success: 'Back to your staff account',
  });
  if (result.ok) navigate('/users');
}
</script>

{#if active}
  <Banner tone="warning" role="status" aria-live="polite" data-testid="impersonation-banner">
    {#snippet icon()}<LucideIcon icon={UserRoundCog} class="size-4 shrink-0" />{/snippet}
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="min-w-0">
        <strong>Impersonating {principal.current?.persona.name ?? active.targetId}</strong>
        ({principal.current?.organization?.name ?? active.tenantId}) as {staffName}. Simulated session, every action is
        audited.
      </p>
      <Button size="sm" variant="outline" onclick={stop}>Stop impersonating</Button>
    </div>
  </Banner>
{/if}
