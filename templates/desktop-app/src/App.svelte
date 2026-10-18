<script lang="ts">
import { createRouter, navigate } from '@protoyard/renderer-svelte';
import { onDestroy } from 'svelte';
import { provideDesktop } from './lib/context.ts';
import Workspace from './screens/Workspace.svelte';

const { runtime } = provideDesktop();

/**
 * Hash routes pick the scope; `?doc=<id>` picks the open document, so a URL
 * restores the exact view after a reload or when shared. Unlike `<Router>`,
 * which remounts the screen per route, a desktop app keeps ONE workspace
 * mounted (sidebar, search and window state survive navigation), so App
 * renders it from the current match directly.
 */
const router = createRouter(
  [
    { path: '/', component: Workspace, title: 'All documents' },
    { path: '/folders/:folderId', component: Workspace, title: 'Folder' },
    { path: '/tags/:tagId', component: Workspace, title: 'Tag' },
  ],
  { titleSuffix: runtime.manifest.name }
);
onDestroy(() => router.destroy());

// Unknown paths fall back to all documents instead of a dead end.
$effect(() => {
  if (!router.current.route) navigate('/', { replace: true });
});
</script>

<Workspace params={router.current.params} query={router.current.query} />
