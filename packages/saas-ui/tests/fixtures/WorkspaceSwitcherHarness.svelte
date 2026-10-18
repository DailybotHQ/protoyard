<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { provideRuntime, usePrincipal } from '@protoyard/renderer-svelte';
import type { WorkspacesService } from '@protoyard/saas';
import WorkspaceSwitcher from '../../src/components/WorkspaceSwitcher.svelte';

interface Props {
  runtime: PrototypeRuntime;
  workspaces?: WorkspacesService;
}

let { runtime, workspaces }: Props = $props();

provideRuntime(runtime);
const principal = usePrincipal(runtime);
</script>

<p data-testid="active-org-id">{principal.current?.organization?.id ?? ''}</p>
<p data-testid="active-org-name">{principal.current?.organization?.name ?? ''}</p>
<WorkspaceSwitcher {runtime} {workspaces} />
