<script lang="ts">
import AssistantWorkspace from '../components/AssistantWorkspace.svelte';
import type { AssistantWidgetProps } from './types.ts';

let { prototypeId: _prototypeId, ...workspaceProps }: AssistantWidgetProps = $props();
</script>

<!-- The panel sets the height: the workspace's own 32rem minimum would overflow a short panel and clip the composer. -->
<div class="h-full min-h-0 w-full *:min-h-0">
  <AssistantWorkspace {...workspaceProps} />
</div>
