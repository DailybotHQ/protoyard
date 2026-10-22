<script lang="ts">
import type { Principal, PrototypeRuntime } from '@protoyard/core';
import AccountGate from '../../src/account-gate/AccountGate.svelte';
import { getSaas, provideSaas } from '../../src/context.ts';

let signedIn = false;
let outcome = $state('');
const listeners = new Set<(principal: Principal | null) => void>();
const session = {
  isSignedIn: () => signedIn,
  principal: () => (signedIn ? ({} as Principal) : null),
  subscribe(listener: (principal: Principal | null) => void) {
    listeners.add(listener);
    listener(signedIn ? ({} as Principal) : null);
    return () => listeners.delete(listener);
  },
};
const runtime = { session } as unknown as PrototypeRuntime;
provideSaas(runtime, { signUpPath: '/sign-up' });
const saas = getSaas();

function gatedAction() {
  outcome = saas.requireAccount({
    reason: 'Save this draft to your account.',
    next: '/editor?draft=new',
  })
    ? 'allowed'
    : 'account-required';
}

function signIn() {
  signedIn = true;
  for (const listener of listeners) listener({} as Principal);
}
</script>

<button onclick={gatedAction}>Save draft</button>
<button onclick={signIn}>Simulate sign in</button>
<output data-testid="gate-outcome">{outcome}</output>
<AccountGate />
