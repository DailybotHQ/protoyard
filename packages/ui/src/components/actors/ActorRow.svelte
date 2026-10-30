<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { Badge } from 'texuli/badge';
import { cn } from '../../lib/cn.ts';
import Avatar from '../avatar/Avatar.svelte';

export type ActorKind = 'person' | 'agent';

export interface ActorIdentity {
  name: string;
  kind: ActorKind;
  role?: string;
  /** Safe image URL; resolve fictional avatar ids with avatarImage() in the renderer. */
  avatarUrl?: string;
  /** Optional safe srcset paired with avatarUrl. */
  avatarSrcset?: string;
}

type Props = Omit<HTMLAttributes<HTMLElement>, 'class' | 'children'> & {
  actor: ActorIdentity;
  /** Optional actor credited with handling this item. */
  handledBy?: ActorIdentity;
  class?: string;
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
};

let { actor, handledBy, class: className, ref = $bindable(null), ...rest }: Props = $props();
const accessibleName = $derived(
  `${actor.name}${actor.role ? `, ${actor.role}` : ''}, ${actor.kind === 'agent' ? 'simulated agent' : 'person'}`
);
</script>

<article
  {...rest}
  bind:this={ref}
  aria-label={accessibleName}
  class={cn(
    'flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3 text-foreground',
    className
  )}
  data-actor-kind={actor.kind}
  data-handled-by-kind={handledBy?.kind}
>
  <Avatar
    name={actor.name}
    src={actor.avatarUrl}
    srcset={actor.avatarSrcset}
    size="md"
    decorative
  />
  <div class="grid min-w-0 flex-1 gap-0.5">
    <span class="truncate font-medium">{actor.name}</span>
    {#if actor.role}<span class="break-words text-sm text-muted-foreground">{actor.role}</span>{/if}
  </div>
  <Badge variant={actor.kind === 'agent' ? 'info' : 'secondary'}>
    {actor.kind === 'agent' ? 'Agent · simulated' : 'Person'}
  </Badge>
  {#if handledBy}
    <Badge variant="success" class="basis-full sm:basis-auto">
      Handled by {handledBy.kind === 'agent' ? 'agent ' : ''}{handledBy.name}
    </Badge>
  {/if}
</article>
