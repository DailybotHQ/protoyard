<script lang="ts">
import { createRouter, Router } from '@protoyard/renderer-svelte';
import { onDestroy } from 'svelte';
import ConversationList from './components/ConversationList.svelte';
import EnvironmentBanner from './components/EnvironmentBanner.svelte';
import NewConversationDialog from './components/NewConversationDialog.svelte';
import { provideChat } from './lib/context.ts';
import Home from './screens/Home.svelte';
import Thread from './screens/Thread.svelte';

const chat = provideChat();

const router = createRouter(
  [
    { path: '/', component: Home, title: 'Conversations' },
    { path: '/c/:id', component: Thread, title: 'Conversation' },
  ],
  { titleSuffix: chat.runtime.manifest.name, scrollToTop: false }
);
onDestroy(() => router.destroy());

let newOpen = $state(false);
const inThread = $derived(router.current.route?.path === '/c/:id');
</script>

<!--
  Container queries (not media queries) pick the layout, so DevTools viewport
  presets that narrow #app get the real single-pane mobile layout.
-->
<div class="@container h-dvh overflow-hidden bg-background text-foreground">
  <div class="flex h-full flex-col">
    <EnvironmentBanner />
    <!-- One <main> for both panes: on phones only one pane is visible at a time. -->
    <main id="main-content" class="flex min-h-0 flex-1">
      <div
        role="region"
        class={[
          'h-full min-h-0 w-full flex-col border-border bg-sidebar @3xl:flex @3xl:w-80 @3xl:shrink-0 @3xl:border-r',
          inThread ? 'hidden' : 'flex',
        ]}
        aria-label="Conversations"
      >
        <ConversationList {router} onNew={() => (newOpen = true)} />
      </div>
      <section
        aria-label="Conversation"
        class={['h-full min-h-0 min-w-0 flex-1 flex-col @3xl:flex', inThread ? 'flex' : 'hidden']}
      >
        <Router {router} />
      </section>
    </main>
  </div>
</div>

<NewConversationDialog bind:open={newOpen} />
