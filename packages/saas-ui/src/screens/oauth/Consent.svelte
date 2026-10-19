<script lang="ts">
import { navigate, runService } from '@protoyard/renderer-svelte';
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
import { onDestroy } from 'svelte';
import { getSaas } from '../../context.ts';
import { applyServiceError, hashParam } from '../auth/helpers.ts';

interface Props {
  params?: Record<string, string>;
  query?: URLSearchParams;
  scenarios?: OAuthProviderScenarios;
}
let { params = {}, query, scenarios = {} }: Props = $props();
const { runtime, config } = getSaas();
let busy = $state(false);
let message = $state('');
let stateIssue = $state('');
let redirecting = $state(false);
const provider = $derived(
  SAAS_PROVIDERS.includes(params.provider as SaasProvider)
    ? (params.provider as SaasProvider)
    : null
);
const details = $derived(provider ? OAUTH_PROVIDER_REGISTRY[provider] : null);
const accents: Record<SaasProvider, string> = {
  google: '#4285f4',
  github: '#6e5494',
  microsoft: '#5e5e5e',
  apple: '#333333',
  slack: '#611f69',
};
const tokenState = $derived(query?.get('state') ?? hashParam('state'));

// The short pause lets the person read the outcome before the redirect. A screen
// that unmounts first (they navigated away) must not navigate later.
let redirectTimer: ReturnType<typeof setTimeout> | undefined;
function redirectSoon(path: string): void {
  redirecting = true;
  redirectTimer = setTimeout(() => navigate(path), 650);
}
onDestroy(() => clearTimeout(redirectTimer));

async function respond(action: 'approve' | 'deny'): Promise<void> {
  if (!provider || !tokenState || busy || redirecting) {
    if (!tokenState)
      stateIssue = 'This simulated consent link is missing its state. Start again from sign in.';
    return;
  }
  busy = true;
  message = '';
  const oauth = createOAuthSimulator(
    runtime as Parameters<typeof createOAuthSimulator>[0],
    scenarios
  );
  if (action === 'deny') {
    const denied = await runService(() => oauth.deny(tokenState));
    busy = false;
    if (!denied.ok) {
      applyServiceError(
        denied.error,
        () => {},
        (next) => (message = next)
      );
      return;
    }
    message = 'Access was denied. No account changes were made.';
    redirectSoon(config.signInPath);
    return;
  }
  const result = await runService(() => oauth.approve(tokenState));
  busy = false;
  if (!result.ok) {
    applyServiceError(
      result.error,
      () => {},
      (next) => (message = next)
    );
    return;
  }
  if (result.value.status === 'denied') {
    message = 'Access was denied. No account changes were made.';
    redirectSoon(config.signInPath);
    return;
  }
  if (result.value.status === 'error') {
    message =
      result.value.reason === 'email-not-shared'
        ? 'The provider did not share an email address. Try another sign-in method.'
        : 'The simulated provider could not complete sign-in.';
    return;
  }
  if (!('route' in result.value)) return;
  const redirectRoute = result.value.route.replace(/^#/, '');
  redirectSoon(redirectRoute);
}
</script>

<main class="mx-auto grid min-h-app w-full max-w-lg content-center p-4 sm:p-8" data-testid="oauth-consent">
  <Card>
    <div class="border-b border-border bg-muted/60 px-6 py-3 text-center text-xs font-medium text-muted-foreground" style={`border-top: 4px solid ${provider ? accents[provider] : 'var(--border)'}`}>
      Simulated {details?.name ?? 'provider'} sign-in — nothing leaves your browser
    </div>
    <CardHeader>
      <CardTitle>{details ? `Continue with ${details.name}?` : 'Provider consent'}</CardTitle>
      <CardDescription>This in-app screen simulates a provider request. It does not contact {details?.name ?? 'an external provider'}.</CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      {#if details}
        <section aria-label="Requested information" class="rounded-md border border-border p-4">
          <p class="font-medium">Information requested</p>
          <p class="mt-1 text-sm text-muted-foreground">{details.scopes}</p>
        </section>
      {:else}
        <p role="alert" class="text-sm text-destructive">This provider is not supported by the simulator.</p>
      {/if}
      {#if stateIssue}<p role="alert" class="text-sm text-destructive">{stateIssue}</p>{/if}
      {#if message}<p role="status" class="text-sm text-muted-foreground">{message}</p>{/if}
      {#if redirecting}<p role="status" class="text-sm text-muted-foreground">Redirecting…</p>{/if}
    </CardContent>
    <CardFooter class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" disabled={!details || busy || redirecting} onclick={() => respond('deny')}>Deny</Button>
      <Button disabled={!details || busy || redirecting} loading={busy} loadingLabel="Completing simulated sign-in" onclick={() => respond('approve')}>Approve</Button>
    </CardFooter>
  </Card>
</main>
