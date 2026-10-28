<script lang="ts">
import { RotateCcw } from '@lucide/svelte';
import { navigate, runService } from '@protoyard/renderer-svelte';
import { AlertDialog, Button, type ButtonVariant } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { useOnboarding } from '../lib/context.ts';

/** "Restart onboarding" with a confirmation. Answers are kept as defaults; invitations stay sent. */
let { variant = 'outline' }: { variant?: ButtonVariant } = $props();
const { services } = useOnboarding();
let open = $state(false);

async function restart() {
  const result = await runService(() => services.restart(), { success: 'Onboarding restarted' });
  if (!result.ok) throw result.error instanceof Error ? result.error : new Error('Restart failed');
  navigate('/onboarding');
}
</script>

<Button {variant} onclick={() => (open = true)}><LucideIcon icon={RotateCcw} />Restart onboarding</Button>
<AlertDialog
  bind:open
  title="Restart onboarding?"
  description="You'll go back to step 1. Your previous answers are kept as defaults, and invitations you already sent stay sent."
  confirmLabel="Restart"
  onConfirm={restart}
/>
