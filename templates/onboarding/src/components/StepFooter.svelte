<script lang="ts">
import { ArrowLeft, ArrowRight } from '@lucide/svelte';
import { Button } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';

/** Back · Skip · Next row shared by every step. `form` is the id of the step's <form>. */
let {
  form,
  busy = false,
  submitLabel = 'Continue',
  onBack,
  onSkip,
}: {
  form: string;
  busy?: boolean;
  submitLabel?: string;
  onBack?: () => void;
  onSkip?: () => void;
} = $props();
</script>

<div class="mt-8 flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:items-center">
  {#if onBack}
    <Button variant="ghost" disabled={busy} onclick={onBack}><LucideIcon icon={ArrowLeft} />Back</Button>
  {/if}
  <div class="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
    {#if onSkip}
      <Button variant="outline" disabled={busy} onclick={onSkip}>Skip for now</Button>
    {/if}
    <Button type="submit" {form} loading={busy}>
      {submitLabel}
      {#if !busy}<LucideIcon icon={ArrowRight} />{/if}
    </Button>
  </div>
</div>
