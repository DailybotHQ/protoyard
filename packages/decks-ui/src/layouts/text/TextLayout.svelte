<script lang="ts">
import type { DeckLayoutId } from '@protoyard/decks';
import LayoutContent from '../LayoutContent.svelte';

let { layout, props }: { layout: DeckLayoutId; props: unknown } = $props();
</script>
<LayoutContent {layout} {props} />
