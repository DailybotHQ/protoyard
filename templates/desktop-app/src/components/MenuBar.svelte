<script lang="ts" module>
import type { DropdownMenuEntry } from '@protoyard/ui';
import { Button } from '@protoyard/ui';

export interface Menu {
  label: string;
  items: DropdownMenuEntry[];
}
</script>

<script lang="ts">
import { DropdownMenu } from '@protoyard/ui';
import { Box } from 'texuli/typography';

/** The app's menu bar: each menu is a real dropdown of actions (no decorative items). */
let { menus }: { menus: Menu[] } = $props();
</script>

<Box surface="default" border="block-end" radius="none" padding="none" class="shrink-0">
<nav aria-label="Application menu" class="flex h-9 items-center gap-0.5 px-2">
  {#each menus as menu (menu.label)}
    <DropdownMenu items={menu.items} align="start">
      {#snippet trigger({ props })}
        <Button
          {...props}
          type="button"
          variant="ghost"
          size="sm"
          class="px-2.5"
        >
          {menu.label}
        </Button>
      {/snippet}
    </DropdownMenu>
  {/each}
</nav>
</Box>
