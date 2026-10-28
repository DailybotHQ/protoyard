<script lang="ts">
import { KeyRound } from '@lucide/svelte';
import { navigate, runService } from '@protoyard/renderer-svelte';
import {
  createOAuthSimulator,
  OAUTH_PROVIDER_REGISTRY,
  type OAuthIntent,
  type OAuthProviderScenarios,
  SAAS_PROVIDERS,
  type SaasProvider,
} from '@protoyard/saas';
import { Button } from 'texuli/button';
import { LucideIcon } from 'texuli/icons/lucide';
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
const uid = $props.id();
const noteId = `sso-simulated-${uid}`;
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
  <p id={noteId} class="text-center text-xs text-muted-foreground">
    Simulated sign-in: no provider is contacted and nothing leaves this browser.
  </p>
  {#each providers as provider (provider)}
    {@const name = OAUTH_PROVIDER_REGISTRY[provider].name}
    <Button
      type="button"
      variant="outline"
      class="w-full justify-center gap-2"
      disabled={busyProvider !== null}
      loading={busyProvider === provider}
      loadingLabel={`Opening ${name}`}
      aria-describedby={noteId}
      onclick={() => start(provider)}
    >
      <LucideIcon icon={KeyRound} size="sm" />
      <span>Continue with {name}</span>
      <span
        class="ml-auto rounded-full border border-border px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground"
        aria-hidden="true"
        data-testid="sso-simulated-label">Simulated</span
      >
    </Button>
  {/each}
  {#if message}<p role="alert" class="text-sm text-destructive">{message}</p>{/if}
</div>
