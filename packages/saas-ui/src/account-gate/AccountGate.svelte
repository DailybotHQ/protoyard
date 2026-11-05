<script lang="ts">
import { navigate } from '@protoyard/renderer-svelte';
import { AdaptiveOverlay, Button, SimulatedTag } from '@protoyard/ui';
import { onMount, type Snippet } from 'svelte';
import { useMessages } from 'texuli/i18n';
import { getSaas } from '../context.ts';
import type { AccountGateRequest } from './account-gate.svelte.ts';

/**
 * The "create an account to continue" dialog for `requireAccount`. Every
 * text has a dictionary default (`protoyard.saas.account-gate.*`, through
 * mountPrototype({ i18n })); a prop overrides it. `content` replaces the
 * reason and note with a custom body; the buttons stay.
 */
let {
  title,
  description,
  note,
  simulatedNote,
  createLabel,
  dismissLabel,
  content,
}: {
  title?: string;
  description?: string;
  /** Line under the reason (default: the screen stays available). */
  note?: string;
  /** The simulated tag's title. */
  simulatedNote?: string;
  createLabel?: string;
  dismissLabel?: string;
  /** Custom body; receives the open request (its `reason` and `next`). */
  content?: Snippet<[AccountGateRequest]>;
} = $props();

const messages = useMessages();
const M = 'protoyard.saas.account-gate';

const { ports, config, accountGate } = getSaas();
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
  const unsubscribe = ports.session.subscribe((principal) => {
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
  title={title ?? messages(`${M}.title`, 'Create an account to continue')}
  description={description ??
    messages(`${M}.description`, 'This action needs an account. You can keep browsing without signing up.')}
  size="sm"
  kind="dialog"
  onOpenChange={(open) => {
    if (!open) accountGate.dismiss();
  }}
>
  {#if request}
    <div class="grid gap-4">
      <SimulatedTag
        title={simulatedNote ??
          messages(`${M}.simulated-note`, 'This sign-up flow is simulated and does not protect account data.')}
      />
      {#if content}
        {@render content(request)}
      {:else}
        <p class="text-sm text-muted-foreground">{request.reason}</p>
        <p class="text-sm text-muted-foreground">
          {note ?? messages(`${M}.note`, 'Your current screen stays available if you choose to keep browsing.')}
        </p>
      {/if}
      <div class="grid gap-2 sm:grid-cols-2">
        <Button onclick={createAccount}>{createLabel ?? messages(`${M}.create`, 'Create account')}</Button>
        <Button variant="outline" onclick={() => accountGate.dismiss()}
          >{dismissLabel ?? messages(`${M}.dismiss`, 'Keep browsing')}</Button
        >
      </div>
    </div>
  {/if}
</AdaptiveOverlay>
