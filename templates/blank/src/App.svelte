<script lang="ts">
import { createRouter, Router } from '@protoyard/renderer-svelte';
import AppHeader from './components/AppHeader.svelte';
import NoteDetail from './screens/NoteDetail.svelte';
import NotesList from './screens/NotesList.svelte';

/** Hash routes work on refresh and back/forward on any static host. Add screens here. */
const router = createRouter(
  [
    { path: '/', component: NotesList, title: 'Notes' },
    { path: '/notes/:id', component: NoteDetail, title: 'Note' },
  ],
  { titleSuffix: 'Blank' }
);
</script>

<div class="flex min-h-dvh flex-col">
  <AppHeader />
  <main id="main" class="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-safe sm:px-6 sm:py-10">
    <Router {router} />
  </main>
</div>
