<script lang="ts">
/** Shown when layout props fail their schema: nothing from them is rendered. */
let { message = 'This slide layout has invalid content.' }: { message?: string } = $props();
</script>

<p class="p-16 text-[24px] text-foreground" role="note">{message}</p>
