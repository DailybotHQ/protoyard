<script lang="ts">
import { ChevronDown } from '@lucide/svelte';
import { Accordion as AccordionPrimitive } from '@texuli/primitives/accordion';
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import type { AccordionItem } from './types.ts';

interface Props {
  items: AccordionItem[];
  /** `single` allows one open item; `multiple` lets several stay open. */
  type?: 'single' | 'multiple';
  /** Open item value (single) or values (multiple). */
  value?: string | string[];
  content?: Snippet<[AccordionItem]>;
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  class?: string;
}

let {
  items,
  type = 'single',
  value = $bindable(),
  content,
  headingLevel = 3,
  class: className,
}: Props = $props();

const asArray = (v: string | string[] | undefined): string[] =>
  Array.isArray(v) ? v : v ? [v] : [];
</script>

{#snippet body()}
  {#each items as item (item.value)}
    <AccordionPrimitive.Item value={item.value} disabled={item.disabled} class="border-b border-border last:border-b-0">
      <AccordionPrimitive.Header level={headingLevel}>
        <AccordionPrimitive.Trigger
          class={cn(
            'group flex w-full min-h-touch items-center justify-between gap-4 py-3 text-left text-sm font-medium transition-colors outline-none',
            'hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:pointer-events-none disabled:opacity-50'
          )}
        >
          {item.title}
          <ChevronDown
            class="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content class="overflow-hidden text-sm text-muted-foreground ui-anim-collapse">
        <div class="pb-4">
          {#if content}
            {@render content(item)}
          {:else}
            {item.content}
          {/if}
        </div>
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  {/each}
{/snippet}

{#if type === 'multiple'}
  <AccordionPrimitive.Root
    type="multiple"
    bind:value={() => asArray(value), (next) => (value = next)}
    class={className}
  >
    {@render body()}
  </AccordionPrimitive.Root>
{:else}
  <AccordionPrimitive.Root
    type="single"
    bind:value={() => asArray(value)[0] ?? '', (next) => (value = next)}
    class={className}
  >
    {@render body()}
  </AccordionPrimitive.Root>
{/if}
