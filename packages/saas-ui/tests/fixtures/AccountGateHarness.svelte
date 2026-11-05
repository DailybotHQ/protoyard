<script lang="ts">
import type { ComponentProps } from 'svelte';
import { LabelsProvider } from 'texuli/i18n';
import AccountGate from '../../src/account-gate/AccountGate.svelte';
import { provideSaas, type SaasContext } from '../../src/context.ts';
import type { SaasPorts } from '../../src/ports.ts';

let {
  ports,
  labels = {},
  gate = {},
  customBody = false,
  onContext,
}: {
  ports: SaasPorts;
  labels?: Record<string, string>;
  gate?: Omit<ComponentProps<typeof AccountGate>, 'content'>;
  customBody?: boolean;
  onContext?: (ctx: SaasContext) => void;
} = $props();

// svelte-ignore state_referenced_locally
onContext?.(provideSaas({ ports }));
</script>

{#snippet body(request: { reason: string; next: string })}
  <p data-custom-body>Custom: {request.reason}</p>
{/snippet}

<LabelsProvider {labels} locale="es">
  <AccountGate {...gate} content={customBody ? body : undefined} />
</LabelsProvider>
