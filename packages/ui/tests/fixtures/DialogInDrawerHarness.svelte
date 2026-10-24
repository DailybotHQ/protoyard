<script lang="ts">
import Dialog from '../../src/components/dialog/Dialog.svelte';
import Drawer from '../../src/components/overlay/Drawer.svelte';
import UndoToaster from '../../src/components/toast/UndoToaster.svelte';
import { Button } from '../../src/index.ts';

let drawerOpen = $state(false);
let dialogOpen = $state(false);
</script>

<UndoToaster />
<Button onclick={() => (drawerOpen = true)}>Open drawer</Button>
<Drawer bind:open={drawerOpen} title="Filters" modal>
  <p>Drawer body</p>
  <Button onclick={() => (dialogOpen = true)}>Open dialog</Button>
  <Dialog bind:open={dialogOpen} title="Confirm filters">
    <p>Dialog body inside the drawer</p>
  </Dialog>
</Drawer>
