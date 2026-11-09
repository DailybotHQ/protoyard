<script lang="ts">
import { Field } from 'texuli/field';
import { EmojiPicker } from '../../src/index.ts';

let { value = '' }: { value?: string } = $props();
</script>

<Field id="mood" label="Team mood">
  {#snippet children(control)}
    <EmojiPicker {...control.props} {value} placeholder="Pick an emoji" />
  {/snippet}
</Field>
