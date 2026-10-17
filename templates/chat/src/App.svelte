<script lang="ts">
import { createRouter, Router } from '@protoyard/renderer-svelte';
import { onDestroy } from 'svelte';
import ConditionBanner from './components/ConditionBanner.svelte';
import ConversationList from './components/ConversationList.svelte';
import NewConversationDialog from './components/NewConversationDialog.svelte';
import { provideChat } from './lib/context.ts';
import Home from './screens/Home.svelte';
import Thread from './screens/Thread.svelte';

const { runtime } = provideChat();

// Hash routes. Add a screen: create it in screens/ and register it here.
const router = createRouter(
  [
    { path: '/', component: Home, title: 'Conversations' },
    { path: '/c/:id', component: Thread, title: 'Conversation' },
  ],
  { titleSuffix: runtime.manifest.name, scrollToTop: false }
);
onDestroy(() => router.destroy());

let newOpen = $state(false);
const inThread = $derived(router.current.route?.path === '/c/:id');
</script>

<!--
  Container queries (`@3xl:`) pick the layout, so DevTools viewport presets
  that narrow #app get the real one-pane phone layout: list OR thread, with a
  back button. Wide containers show both panes.
-->
<div class="@container h-dvh overflow-hidden bg-background text-foreground">
  <div class="flex h-full flex-col">
    <ConditionBanner />
    <div class="flex min-h-0 flex-1">
      <aside
        aria-label="Conversation list"
        class={['h-full w-full flex-col bg-sidebar @3xl:flex @3xl:w-80 @3xl:shrink-0 @3xl:border-r @3xl:border-border', inThread ? 'hidden' : 'flex']}
      >
        <ConversationList {router} onNew={() => (newOpen = true)} />
      </aside>
      <main id="main-content" class={['h-full min-w-0 flex-1 flex-col @3xl:flex', inThread ? 'flex' : 'hidden']}>
        <Router {router} onNew={() => (newOpen = true)} />
      </main>
    </div>
  </div>
</div>

<NewConversationDialog bind:open={newOpen} />
