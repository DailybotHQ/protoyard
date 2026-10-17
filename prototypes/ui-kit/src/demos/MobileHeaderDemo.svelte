<script lang="ts">
import { Pencil, Star } from '@lucide/svelte';
import { Button, MobileHeader, toast } from '@protoyard/ui';

const contacts = [
  { id: 'c1', name: 'Ana Lee', role: 'Designer · Lisbon' },
  { id: 'c2', name: 'Omar Diaz', role: 'Engineer · Bogotá' },
  { id: 'c3', name: 'Priya Shah', role: 'Product · Pune' },
];
let openId = $state<string | null>(null);
let starred = $state<string[]>([]);
const contact = $derived(contacts.find((c) => c.id === openId));
</script>

<div class="mx-auto flex h-[420px] max-w-[390px] flex-col overflow-hidden rounded-[2rem] border-4 border-border bg-background">
  {#if contact}
    {@const isStarred = starred.includes(contact.id)}
    <MobileHeader title={contact.name} subtitle={contact.role} onBack={() => (openId = null)} backLabel="Back to contacts">
      {#snippet actions()}
        <Button
          size="icon"
          variant="ghost"
          aria-label={isStarred ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={isStarred}
          onclick={() =>
            (starred = isStarred ? starred.filter((id) => id !== contact.id) : [...starred, contact.id])}
        >
          <Star aria-hidden="true" class={isStarred ? 'fill-current text-warning' : undefined} />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Edit contact" onclick={() => toast.info('Edit (demo)')}>
          <Pencil aria-hidden="true" />
        </Button>
      {/snippet}
    </MobileHeader>
    <div class="p-5 text-sm text-muted-foreground">
      Contact details for {contact.name}. The back button returns to the list.
    </div>
  {:else}
    <MobileHeader title="Contacts" subtitle={`${contacts.length} people`} />
    <ul class="divide-y divide-border">
      {#each contacts as item (item.id)}
        <li>
          <button
            type="button"
            class="flex min-h-touch w-full flex-col items-start px-4 py-3 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
            onclick={() => (openId = item.id)}
          >
            <span class="text-sm font-medium">{item.name}{starred.includes(item.id) ? ' ★' : ''}</span>
            <span class="text-xs text-muted-foreground">{item.role}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
