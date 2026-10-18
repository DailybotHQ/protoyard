<script lang="ts">
import { navigate, runService, usePrincipal } from '@protoyard/renderer-svelte';
import {
  createOAuthSimulator,
  OAUTH_PROVIDER_REGISTRY,
  type OAuthProviderScenarios,
  SAAS_PROVIDERS,
  type SaasProvider,
} from '@protoyard/saas';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@protoyard/ui';
import { getSaas } from '../../context.ts';
import { hashParam } from '../auth/helpers.ts';

interface Props {
  params?: Record<string, string>;
  query?: URLSearchParams;
  scenarios?: OAuthProviderScenarios;
}
let { params = {}, query, scenarios = {} }: Props = $props();
const { runtime, config } = getSaas();
const principal = usePrincipal(runtime);
const provider = $derived(
  SAAS_PROVIDERS.includes(params.provider as SaasProvider)
    ? (params.provider as SaasProvider)
    : null
);
const name = $derived(provider ? OAUTH_PROVIDER_REGISTRY[provider].name : 'provider');
const email = $derived(query?.get('email') ?? hashParam('email'));
let busy = $state(false);
let message = $state('');

async function confirmLink(): Promise<void> {
  if (!provider || busy) return;
  busy = true;
  message = '';
  if (!principal.current) {
    const next = `/oauth/${provider}/link?email=${encodeURIComponent(email)}`;
    navigate(`${config.signInPath}?next=${encodeURIComponent(next)}`);
    return;
  }
  const oauth = createOAuthSimulator(
    runtime as Parameters<typeof createOAuthSimulator>[0],
    scenarios
  );
  const started = await runService(() => oauth.start(provider, 'link'));
  busy = false;
  if (!started.ok) {
    message =
      started.error instanceof Error ? started.error.message : 'Could not start account linking.';
    return;
  }
  navigate(started.value.route.replace(/^#/, ''));
}
</script>

<main class="mx-auto grid min-h-app w-full max-w-lg content-center p-4 sm:p-8" data-testid="oauth-account-link">
  <Card>
    <CardHeader>
      <CardTitle>Link your {name} account?</CardTitle>
      <CardDescription>A simulated sign-in found an existing account with the same email. Confirm that you want to link this provider to the existing account.</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-3">
      {#if email}<p class="rounded-md border border-border p-3 text-sm">Existing account: <strong>{email}</strong></p>{/if}
      <p class="text-xs text-muted-foreground">No external provider is contacted. Linking is saved only in this prototype's simulated database.</p>
      {#if message}<p role="alert" class="text-sm text-destructive">{message}</p>{/if}
      {#if !principal}<p role="status" class="text-sm text-muted-foreground">Sign in to the existing account before confirming the link.</p>{/if}
    </CardContent>
    <CardFooter class="flex justify-end gap-2">
      <Button variant="outline" onclick={() => navigate(config.signInPath)}>Cancel</Button>
      <Button disabled={!provider || busy} loading={busy} loadingLabel="Preparing account link" onclick={() => void confirmLink()}>{principal.current ? 'Continue to consent' : 'Sign in to link'}</Button>
    </CardFooter>
  </Card>
</main>
