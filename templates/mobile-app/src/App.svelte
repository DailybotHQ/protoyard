<script lang="ts">
import { ListTodo, Plus, UserRound } from '@lucide/svelte';
import { createRouter, Router } from '@protoyard/renderer-svelte';
import { BottomNav, MobileAppShell } from '@protoyard/ui';
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

<!--
  The shell is exactly one app-height tall (--py-app-height: the window, or the
  device screen inside a shell frame). Only <main> scrolls, and the bottom nav
  sits in normal flow below it, so it is always visible. On a desktop window,
  ShellHost frames the app as a phone (platform "mobile").
-->
<MobileAppShell mainId="main">
  <Router {router} />
  {#snippet bottomNav()}
    <BottomNav {items} label="Main" fixed={false} />
  {/snippet}
</MobileAppShell>
