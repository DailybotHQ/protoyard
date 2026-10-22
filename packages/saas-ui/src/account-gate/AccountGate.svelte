<script lang="ts">
import { navigate } from '@protoyard/renderer-svelte';
import { AdaptiveOverlay, Button, SimulatedTag } from '@protoyard/ui';
import { onMount } from 'svelte';
import { getSaas } from '../context.ts';

const { runtime, config, accountGate } = getSaas();
let request = $derived(accountGate.current);

function createAccount() {
  const current = request;
  if (!current) return;
  accountGate.continueToSignUp();
  const separator = config.signUpPath.includes('?') ? '&' : '?';
  navigate(config.signUpPath + separator + new URLSearchParams({ next: current.next }).toString());
}

onMount(() => {
  const dismiss = () => accountGate.dismissWhenScreenChanges();
  window.addEventListener('hashchange', dismiss);
  const unsubscribe = runtime.session.subscribe((principal) => {
    accountGate.onSessionChange(Boolean(principal));
  });
  return () => {
    window.removeEventListener('hashchange', dismiss);
    unsubscribe();
  };
});
</script>

<AdaptiveOverlay
  open={request !== null}
  title="Create an account to continue"
  description="This action needs an account. You can keep browsing without signing up."
  size="sm"
  kind="dialog"
  onOpenChange={(open) => {
    if (!open) accountGate.dismiss();
  }}
>
  {#if request}
    <div class="grid gap-4">
      <SimulatedTag title="This sign-up flow is simulated and does not protect account data." />
      <p class="text-sm text-muted-foreground">{request.reason}</p>
      <p class="text-sm text-muted-foreground">Your current screen stays available if you choose to keep browsing.</p>
      <div class="grid gap-2 sm:grid-cols-2">
        <Button onclick={createAccount}>Create account</Button>
        <Button variant="outline" onclick={() => accountGate.dismiss()}>Keep browsing</Button>
      </div>
    </div>
  {/if}
</AdaptiveOverlay>
