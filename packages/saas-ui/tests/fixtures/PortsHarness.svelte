<script lang="ts">
import { Button } from '@protoyard/ui';
import SsoButtons from '../../src/components/SsoButtons.svelte';
import WorkspaceSwitcher from '../../src/components/WorkspaceSwitcher.svelte';
import { provideSaas, type SaasContext } from '../../src/context.ts';
import type { SaasPorts } from '../../src/ports.ts';

interface Props {
  ports: SaasPorts;
  signIn: () => void;
  onContext?: (ctx: SaasContext) => void;
}

let { ports, signIn, onContext }: Props = $props();

// A product's own session and services, no simulated engine (ADR-046).
const ctx = provideSaas({ ports });
onContext?.(ctx);
let signedIn = $state(ports.session.isSignedIn());
$effect(() => ports.session.subscribe((principal) => (signedIn = principal !== null)));
</script>

{#if signedIn}
  <WorkspaceSwitcher />
{:else}
  <Button onclick={signIn}>Sign in</Button>
  <SsoButtons providers={['google']} />
{/if}
