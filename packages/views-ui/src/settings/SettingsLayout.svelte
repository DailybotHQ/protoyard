<script lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/svelte';
import { Button } from '@protoyard/ui';
import type { Snippet } from 'svelte';
import { tick } from 'svelte';
import { cx } from 'texuli/cx';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import type { SettingsNavItem } from './types.ts';

interface Props {
  title?: string;
  description?: string;
  sections: readonly SettingsNavItem[];
  /** The open section id; bind it, or drive it from the route (`/settings/:section`). */
  active?: string;
  /** Called when a section is chosen (navigate here when the section lives in the URL). */
  onSelect?: (id: string) => void;
  /** Phones start on the section list unless a section was asked for (default true). */
  startWithList?: boolean;
  /** Renders the open section. */
  children: Snippet<[string]>;
  class?: string;
}

let {
  title = 'Settings',
  description,
  sections,
  active = $bindable(sections[0]?.id ?? ''),
  onSelect,
  startWithList = true,
  children,
  class: className,
}: Props = $props();

const uid = $props.id();
// Below `md` the list and the open section are separate screens; wider, both show.
// `startWithList` only sets where phones start, so reading its first value is intended.
// svelte-ignore state_referenced_locally
let listOpen = $state(startWithList);
let detailHeading = $state<HTMLHeadingElement>();
let nav = $state<HTMLElement>();
const current = $derived(sections.find((section) => section.id === active) ?? sections[0]);

async function choose(id: string) {
  active = id;
  onSelect?.(id);
  listOpen = false;
  await tick();
  detailHeading?.focus();
}

async function backToList() {
  listOpen = true;
  await tick();
  nav?.querySelector<HTMLElement>('[aria-current="page"]')?.focus();
}
</script>

<div class={cx('mx-auto grid w-full max-w-5xl gap-6 p-4 sm:p-8', className)}>
  <header class={cx(listOpen ? 'block' : 'hidden', 'md:block')}>
    <h1 class="text-2xl font-semibold">{title}</h1>
    {#if description}<p class="mt-1 text-sm text-muted-foreground">{description}</p>{/if}
  </header>
  <div class="grid gap-6 md:grid-cols-[13rem_1fr]">
    <nav
      bind:this={nav}
      aria-label={`${title} sections`}
      class={cx(listOpen ? 'block' : 'hidden', 'md:block')}
    >
      <ul class="flex flex-col gap-1">
        {#each sections as section (section.id)}
          {@const selected = section.id === current?.id}
          <li>
            <Button
              type="button"
              aria-current={selected ? 'page' : undefined}
              class={cx(
                'flex min-h-touch w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:min-h-0',
                selected && 'md:bg-muted md:font-medium'
              )}
              onclick={() => choose(section.id)}
            >
              {#if section.icon}<section.icon class="size-4 shrink-0 text-muted-foreground" />{/if}
              <span class="min-w-0 flex-1">
                <span class="block truncate">{section.label}</span>
                {#if section.description}
                  <span class="block truncate text-xs text-muted-foreground md:hidden">{section.description}</span>
                {/if}
              </span>
              <Icon icon="chevron-right" class="size-4 shrink-0 text-muted-foreground md:hidden"  />
            </Button>
          </li>
        {/each}
      </ul>
    </nav>
    <section
      aria-labelledby={`settings-${uid}-heading`}
      class={cx(listOpen ? 'hidden' : 'block', 'min-w-0 md:block')}
    >
      <Button variant="ghost" size="sm" class="-ml-2 mb-2 md:hidden" onclick={() => backToList()}>
        <LucideIcon icon={ChevronLeft} class="size-4"  />
        {title}
      </Button>
      <h2
        bind:this={detailHeading}
        id={`settings-${uid}-heading`}
        tabindex="-1"
        class="mb-4 text-lg font-semibold outline-none"
      >
        {current?.label ?? ''}
      </h2>
      <!-- Each section mounts fresh: its own state and scroll never leak into the next. -->
      {#if current}{#key current.id}{@render children(current.id)}{/key}{/if}
    </section>
  </div>
</div>
