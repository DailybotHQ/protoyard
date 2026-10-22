<script lang="ts">
import type { FormBlock as FormBlockType } from '@protoyard/blocks';
import { Button } from '@protoyard/ui';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';

/**
 * Form blocks store responses through the pages form-response runtime, not
 * BlockStateHost. This view is an honest placeholder until the pages kit's
 * FormBlock replaces it through the host: it shows the fields disabled and
 * explains that submit is handled by the page host.
 */
let { block }: { block: FormBlockType } = $props();
</script>

<section
  class="grid gap-3 rounded-lg border border-border bg-card p-4"
  data-py-block="form"
  {...{ [DECK_INTERACTIVE_ATTRIBUTE]: '' }}
  data-block-id={block.id}
  aria-labelledby="form-title-{block.id}"
>
  {#if block.title}
    <h3 class="text-base font-semibold text-foreground" id="form-title-{block.id}">
      {block.title}
    </h3>
  {/if}
  {#if block.description}
    <p class="text-sm text-muted-foreground">{block.description}</p>
  {/if}

  <div class="grid gap-3">
    {#each block.fields as field (field.name)}
      <label class="grid gap-1 text-sm">
        <span class="font-medium text-foreground">
          {field.label}
          {#if field.required}<span class="text-destructive" aria-hidden="true">*</span>{/if}
        </span>
        {#if field.type === 'longText'}
          <textarea
            class="min-h-20 rounded-md border border-border bg-background px-2 py-1.5"
            name={field.name}
            disabled
            placeholder="Handled by the page form runtime"
          ></textarea>
        {:else}
          <input
            class="rounded-md border border-border bg-background px-2 py-1.5"
            type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
            name={field.name}
            disabled
            placeholder="Handled by the page form runtime"
          />
        {/if}
      </label>
    {/each}
  </div>

  <Button size="sm" class="w-fit" disabled>
    {block.submitLabel}
  </Button>
  <p class="text-xs text-muted-foreground" role="note">
    Form responses are saved by the page host (not this block). Simulated only — no network.
  </p>
</section>
