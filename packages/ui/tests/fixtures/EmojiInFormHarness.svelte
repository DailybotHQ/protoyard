<script lang="ts">
import { EmojiPicker } from '../../src/index.ts';

let { onsubmit }: { onsubmit: (event: SubmitEvent) => void } = $props();
let value = $state('');
</script>

<form {onsubmit}>
  <EmojiPicker bind:value label="Reaction" />
</form>
