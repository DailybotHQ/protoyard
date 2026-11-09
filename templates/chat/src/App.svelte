<script lang="ts">
import { createRouter, Router } from '@protoyard/renderer-svelte';
import { Separator } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { Box } from 'texuli/typography';
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
<div class="@container h-app overflow-hidden">
  <div class="flex h-full flex-col">
    <ConditionBanner />
    <!-- One <main> for both panes: on phones only one pane is visible at a time. -->
    <main id="main-content" class="flex min-h-0 flex-1">
      <Box
        role="region"
        aria-label="Conversation list"
        surface="subtle"
        radius="none"
        padding="none"
        class={['h-full w-full flex-col @3xl:flex @3xl:w-80 @3xl:shrink-0', inThread ? 'hidden' : 'flex']}
      >
        <ConversationList {router} onNew={() => (newOpen = true)} />
      </Box>
      <Separator orientation="vertical" class="hidden @3xl:block" />
      <section aria-label="Conversation" class={['h-full min-w-0 flex-1 flex-col @3xl:flex', inThread ? 'flex' : 'hidden']}>
        <Router {router} onNew={() => (newOpen = true)} />
      </section>
    </main>
  </div>
</div>

<NewConversationDialog bind:open={newOpen} />
