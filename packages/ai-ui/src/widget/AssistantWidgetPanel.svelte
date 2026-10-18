<script lang="ts">
import AssistantWorkspace from '../components/AssistantWorkspace.svelte';
import type { AssistantWidgetProps } from './types.ts';

let { prototypeId: _prototypeId, ...workspaceProps }: AssistantWidgetProps = $props();
</script>

<div class="h-full min-h-0 w-full">
  <AssistantWorkspace {...workspaceProps} />
</div>
