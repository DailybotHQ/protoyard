<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { navigate, runService } from '@protoyard/renderer-svelte';
import {
  createOAuthSimulator,
  type OAuthIntent,
  type OAuthProviderScenarios,
  SAAS_PROVIDERS,
  type SaasProvider,
} from '@protoyard/saas';
import { Button } from '@protoyard/ui';
import { getSaas } from '../context.ts';

interface Props {
  /** Providers to offer. Defaults to every configured simulated provider. */
  providers?: readonly SaasProvider[];
  /** OAuth account flow to start. */
  intent?: OAuthIntent;
  /** Optional scenario identities and outcomes for the providers. */
  scenarios?: OAuthProviderScenarios;
  class?: string;
}

let {
  providers = SAAS_PROVIDERS,
  intent = 'sign-in',
  scenarios = {},
  class: className,
}: Props = $props();
const runtime = getSaas().runtime as Parameters<typeof createOAuthSimulator>[0];
let busyProvider = $state<SaasProvider | null>(null);
let message = $state('');

async function start(provider: SaasProvider): Promise<void> {
  if (busyProvider) return;
  busyProvider = provider;
  message = '';
  const result = await runService(() =>
    createOAuthSimulator(runtime, scenarios).start(provider, intent)
  );
  busyProvider = null;
  if (!result.ok) {
    message =
      result.error instanceof Error ? result.error.message : 'Could not start simulated sign-in.';
    return;
  }
  navigate(result.value.route.replace(/^#/, ''));
}
</script>

<div class={className ?? 'grid gap-2'} data-testid="sso-buttons">
  {#each providers as provider (provider)}
    {@const name = provider === 'github' ? 'GitHub' : provider[0]?.toUpperCase() + provider.slice(1)}
    <Button
      type="button"
      variant="outline"
      class="w-full justify-center"
      disabled={busyProvider !== null}
      loading={busyProvider === provider}
      loadingLabel={`Opening ${name}`}
      onclick={() => void start(provider)}
    >
      Continue with {name}
    </Button>
  {/each}
  {#if message}<p role="alert" class="text-sm text-destructive">{message}</p>{/if}
</div>
