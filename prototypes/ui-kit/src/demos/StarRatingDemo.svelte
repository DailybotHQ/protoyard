<script lang="ts">
import { StarRating } from '@protoyard/ui';

let score = $state(0);
let locked = $state(3);
</script>

<div class="grid max-w-md gap-6">
  <StarRating label="Experience" bind:value={score} />
  <p class="text-xs text-muted-foreground" aria-live="polite">
    {score === 0 ? 'Pick a rating.' : `You chose ${score} of 5.`}
  </p>
  <StarRating label="Locked score" bind:value={locked} disabled />
</div>
