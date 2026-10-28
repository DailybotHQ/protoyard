<script lang="ts">
import EmojiPicker from '../../src/components/form/utilities/EmojiPicker.svelte';

let { value = '' }: { value?: string } = $props();
</script>

<form data-testid="form">
  <EmojiPicker label="Reaction" name="reaction" required bind:value />
</form>
