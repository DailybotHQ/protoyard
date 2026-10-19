<script lang="ts">
import { getRuntime, usePrincipal } from '@protoyard/renderer-svelte';
import { InboxDrawer } from '@protoyard/saas-ui';
import { onMount } from 'svelte';
import { createPendingInboxServices, type PendingInbox } from '../domain/pending-inbox.ts';

/**
 * `/inbox`: signed in, the kit inbox for the persona's address. Signed out
 * with `?account=` (the link the sign-up screen offers), the inbox of that
 * pending account only, so the new person can open the confirmation message.
 */
interface Props {
  query?: URLSearchParams;
}
let { query }: Props = $props();
const runtime = getRuntime();
const principal = usePrincipal(runtime);
const pendingInboxes = createPendingInboxServices(runtime);
let pending = $state<PendingInbox | null>(null);
let pendingError = $state('');
let loading = $state(false);

const signedIn = $derived(principal.current !== null);

onMount(() => {
  if (signedIn) return;
  const accountId =
    query?.get('account') ??
    new URLSearchParams(location.hash.split('?')[1] ?? '').get('account') ??
    '';
  loading = true;
  pendingInboxes.open(accountId).then(
    (opened) => {
      pending = opened;
      loading = false;
    },
    (error: unknown) => {
      const issues = (error as { issues?: Record<string, string> }).issues;
      pendingError =
        issues?.form ?? (error instanceof Error ? error.message : 'The inbox could not open.');
      loading = false;
    }
  );
});
</script>

{#if signedIn}
  <InboxDrawer embedded />
{:else if pending}
  <div class="grid gap-2" data-testid="pending-inbox">
    <p class="mx-auto w-full max-w-2xl px-6 text-sm text-muted-foreground">
      You are not signed in yet. Open the confirmation message to verify your email, then sign in.
    </p>
    <InboxDrawer embedded recipient={pending.email} service={pending.service} lockRecipient />
  </div>
{:else if loading}
  <p class="p-6 text-sm text-muted-foreground" role="status">Opening your simulated inbox…</p>
{:else}
  <section class="mx-auto grid max-w-md gap-3 p-6" aria-labelledby="pending-inbox-title">
    <h1 id="pending-inbox-title" class="text-xl font-semibold">Simulated inbox</h1>
    <p role="alert" class="text-sm text-destructive">{pendingError}</p>
    <a class="text-sm font-medium text-primary underline-offset-4 hover:underline" href="#/sign-in">Go to sign in</a>
  </section>
{/if}
