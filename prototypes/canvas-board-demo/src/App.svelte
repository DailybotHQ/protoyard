<script lang="ts">
import { createRouter, Router } from '@protoyard/renderer-svelte';
import AppHeader from './components/AppHeader.svelte';
import BoardsList from './screens/BoardsList.svelte';

/** Hash routes work on refresh and back/forward on any static host. The canvas screen is a lazy chunk. */
const router = createRouter(
  [
    { path: '/', component: BoardsList, title: 'Boards' },
    { path: '/boards/:id', load: () => import('./screens/BoardScreen.svelte'), title: 'Board' },
  ],
  { titleSuffix: 'Canvas Board' }
);
</script>

<div class="flex min-h-dvh flex-col">
  <AppHeader />
  <main id="main" class="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-safe sm:px-6 sm:py-10">
    <Router {router} />
  </main>
</div>
