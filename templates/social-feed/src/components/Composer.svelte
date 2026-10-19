<script lang="ts">
import { ImagePlus } from '@lucide/svelte';
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button, Textarea } from '@protoyard/ui';
import { MAX_POST_LENGTH } from '../domain/validation.ts';
import { useSocial } from '../lib/context.ts';

/** The composer: a primary input (data-py-composer) that stays on screen above the feed. */
let { onposted }: { onposted?: () => void } = $props();

const { services } = useSocial();
const uid = $props.id();
let text = $state('');
let withImage = $state(false);
let error = $state<string | undefined>(undefined);

async function post() {
  error = undefined;
  const result = await runService(() => services.posts.create({ text, withImage }), {
    success: 'Posted',
  });
  if (result.ok) {
    text = '';
    withImage = false;
    onposted?.();
  } else if (isValidationError(result.error)) {
    error = result.error.issues.text;
  }
}
</script>

<form
  class="grid gap-2 border-b border-border bg-surface p-3"
  onsubmit={(e) => {
    e.preventDefault();
  }}
  aria-label="Write a post"
>
  <label for="{uid}-text" class="sr-only">What's on your mind?</label>
  <Textarea
    id="{uid}-text"
    data-py-composer=""
    bind:value={text}
    rows={2}
    maxlength={MAX_POST_LENGTH}
    placeholder="What's on your mind? Mention people with @handle."
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={error ? `${uid}-error` : `${uid}-count`}
    onkeydown={(e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void post();
    }}
  />
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div class="flex items-center gap-2">
      <Button variant={withImage ? 'secondary' : 'ghost'} size="sm" aria-pressed={withImage} onclick={() => (withImage = !withImage)}>
        <ImagePlus class="size-4" aria-hidden="true" />Image
      </Button>
      {#if error}
        <p id="{uid}-error" class="text-xs text-destructive" role="alert">{error}</p>
      {:else}
        <p id="{uid}-count" class="text-xs text-muted-foreground tabular-nums">{MAX_POST_LENGTH - text.length} left</p>
      {/if}
    </div>
    <Button size="sm" onclick={post}>Post</Button>
  </div>
</form>
