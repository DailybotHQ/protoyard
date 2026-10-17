<script lang="ts">
import { ListTodo, Plus, UserRound } from '@lucide/svelte';
import { createRouter, Router } from '@protoyard/renderer-svelte';
import { BottomNav } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { provideApp } from './lib/context.ts';
import ItemDetail from './screens/ItemDetail.svelte';
import ItemEdit from './screens/ItemEdit.svelte';
import ItemsList from './screens/ItemsList.svelte';
import Profile from './screens/Profile.svelte';

const app = provideApp();

// Hash routes: add a screen here and (optionally) a tab below.
const router = createRouter(
  [
    { path: '/', component: ItemsList, title: 'Items' },
    { path: '/items/new', component: ItemEdit, title: 'New item' },
    { path: '/items/:id', component: ItemDetail, title: 'Item' },
    { path: '/items/:id/edit', component: ItemEdit, title: 'Edit item' },
    { path: '/profile', component: Profile, title: 'Profile' },
  ],
  { titleSuffix: app.runtime.manifest.name }
);
onDestroy(() => router.destroy());

const items = $derived([
  {
    label: 'Items',
    href: router.href('/'),
    icon: ListTodo,
    active:
      router.isActive('/', true) || (router.isActive('/items') && !router.isActive('/items/new')),
  },
  {
    label: 'New',
    href: router.href('/items/new'),
    icon: Plus,
    active: router.isActive('/items/new'),
  },
  {
    label: 'Profile',
    href: router.href('/profile'),
    icon: UserRound,
    active: router.isActive('/profile'),
  },
]);
</script>

<!-- A phone-width column: full screen on phones, centered on larger screens. -->
<div class="min-h-dvh bg-muted/40 md:py-6">
  <div
    class="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background md:min-h-[calc(100dvh-3rem)] md:overflow-hidden md:rounded-3xl md:border md:border-border md:shadow-xl"
  >
    <main class="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <Router {router} />
    </main>
  </div>
  <BottomNav {items} label="Main" />
</div>
