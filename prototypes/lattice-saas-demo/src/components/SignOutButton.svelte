<script lang="ts">
import { LogOut } from '@lucide/svelte';
import type { PrototypeRuntime } from '@protoyard/core';
import { navigate, runService } from '@protoyard/renderer-svelte';
import { createAuthServices } from '@protoyard/saas';
import { Button } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';

/**
 * Header sign-out for every signed-in persona. Signing yourself out needs no
 * capability (`auth.signOut`: `environment.run('auth.signOut')`, one
 * transaction that logs the sign-out, then the session ends). The admin-only
 * "Sign out" in Settings → Security (`settings:security`) stays as it is.
 */
interface Props {
  runtime: PrototypeRuntime;
  signInPath?: string;
}
let { runtime, signInPath = '/sign-in' }: Props = $props();
let busy = $state(false);
let error = $state('');

async function signOut(): Promise<void> {
  if (busy) return;
  busy = true;
  error = '';
  const auth = createAuthServices(runtime as Parameters<typeof createAuthServices>[0]);
  const result = await runService(() => auth.signOut());
  busy = false;
  if (result.ok) navigate(signInPath);
  else error = result.error instanceof Error ? result.error.message : 'Could not sign out.';
}
</script>

<span class="inline-flex items-center gap-2">
  <Button
    type="button"
    variant="ghost"
    class="inline-flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
    disabled={busy}
    aria-busy={busy || undefined}
    onclick={() => void signOut()}
  >
    <LucideIcon icon={LogOut} class="size-4" />
    {busy ? 'Signing out…' : 'Sign out'}
  </Button>
  {#if error}<span role="alert" class="text-xs text-destructive">{error}</span>{/if}
</span>
