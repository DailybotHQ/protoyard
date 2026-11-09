<script lang="ts">
import { Button } from 'texuli/button';

let count = $state(0);
</script>

<div class="flex items-center gap-2">
  <Button onclick={() => (count += 1)}>Add one</Button>
  <span>{count}</span>
</div>
