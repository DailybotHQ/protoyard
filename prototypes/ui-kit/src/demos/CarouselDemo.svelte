<script lang="ts">
import { Carousel, type CarouselItem } from '@protoyard/ui';

const items: CarouselItem[] = [
  {
    id: 'welcome',
    label: 'Welcome',
  },
  {
    id: 'team',
    label: 'Invite your team',
  },
  {
    id: 'ready',
    label: 'You are ready',
  },
];

const copy: Record<string, { title: string; body: string }> = {
  welcome: {
    title: 'Welcome to Northstar',
    body: 'A calm place for a fictional team to plan work together.',
  },
  team: {
    title: 'Invite your team',
    body: 'Add a few people with example.com addresses so everyone can explore.',
  },
  ready: {
    title: 'You are ready',
    body: 'Open the board, pick a scenario and try the flows end to end.',
  },
};

let index = $state(0);
</script>

<div class="grid max-w-lg gap-4">
  <p class="text-xs text-muted-foreground">
    Keyboard arrows when the carousel is focused; swipe on a pointer device; dots and buttons too.
  </p>
  <Carousel bind:index {items} label="Product tour">
    {#snippet children(item)}
      {@const slide = copy[item.id] ?? { title: item.label, body: '' }}
      <div class="grid gap-3 rounded-lg border border-border bg-surface p-6 shadow-soft">
        <p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Slide {index + 1} of {items.length}
        </p>
        <h3 class="text-lg font-semibold text-foreground">{slide.title}</h3>
        <p class="text-sm leading-6 text-muted-foreground">{slide.body}</p>
      </div>
    {/snippet}
  </Carousel>
</div>
