<script lang="ts">
import { Dialog } from 'bits-ui';

let open = $state(false);
</script>

<Dialog.Root bind:open>
  <Dialog.Content>Invite a teammate</Dialog.Content>
</Dialog.Root>
