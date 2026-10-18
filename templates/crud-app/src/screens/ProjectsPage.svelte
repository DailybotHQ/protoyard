<script lang="ts">
import type { RouteProps } from '@protoyard/renderer-svelte';
import EntityPage from './EntityPage.svelte';

let props: RouteProps = $props();
</script>

<EntityPage entityName="project" {...props} />
