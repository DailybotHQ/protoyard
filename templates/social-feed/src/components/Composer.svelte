<script lang="ts">
import { ImagePlus } from '@lucide/svelte';
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button, Textarea } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Text } from 'texuli/typography';
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

<Box surface="default" border="block-end" radius="none" padding="sm">
<form
  class="grid gap-2"
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
        <LucideIcon icon={ImagePlus} class="size-4" />Image
      </Button>
      {#if error}
        <Text id="{uid}-error" size="xs" tone="destructive" role="alert">{error}</Text>
      {:else}
        <Text id="{uid}-count" size="xs" tone="muted" tabular>{MAX_POST_LENGTH - text.length} left</Text>
      {/if}
    </div>
    <Button size="sm" onclick={post}>Post</Button>
  </div>
</form>
</Box>
