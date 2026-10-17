<script lang="ts">
import { Folder } from '@lucide/svelte';
import { Breadcrumb } from '@protoyard/ui';
import { interceptDemoNav } from './nav.ts';

interface Node {
  name: string;
  children?: Node[];
}

const root: Node = {
  name: 'Drive',
  children: [
    {
      name: 'Design',
      children: [
        { name: 'Brand', children: [{ name: 'Logos' }, { name: 'Colors' }] },
        { name: 'Product', children: [{ name: 'Onboarding' }] },
      ],
    },
    { name: 'Engineering', children: [{ name: 'RFCs' }, { name: 'Runbooks' }] },
  ],
};

let path = $state<Node[]>([root]);
const current = $derived(path[path.length - 1] ?? root);
const items = $derived(
  path.map((node, index) => ({ label: node.name, href: `#demo/crumb/${index}` }))
);

function navigate(href: string): void {
  const index = Number(href.split('/').pop());
  if (Number.isInteger(index)) path = path.slice(0, index + 1);
}
</script>

<div class="grid gap-4">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div onclick={(event) => interceptDemoNav(event, navigate)}>
    <Breadcrumb {items} label="Folder path" />
  </div>
  <ul class="grid max-w-sm gap-1">
    {#each current.children ?? [] as child (child.name)}
      <li>
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onclick={() => (path = [...path, child])}
        >
          <Folder class="size-4 text-muted-foreground" aria-hidden="true" />
          {child.name}
        </button>
      </li>
    {:else}
      <li class="text-sm text-muted-foreground">This folder is empty. Use the breadcrumb to go back.</li>
    {/each}
  </ul>
  <p class="text-xs text-muted-foreground">The last crumb is the current page (aria-current).</p>
</div>
