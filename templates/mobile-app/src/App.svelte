<script lang="ts">
import {
  avatarImage,
  createRouter,
  Router,
  useAppearance,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { LayoutHost, type NavModel } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { provideApp } from './lib/context.ts';
import ItemDetail from './screens/ItemDetail.svelte';
import ItemEdit from './screens/ItemEdit.svelte';
import ItemsList from './screens/ItemsList.svelte';
import Profile from './screens/Profile.svelte';

const app = provideApp();
const principal = usePrincipal();
const appearance = useAppearance();

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

const nav = $derived({
  brand: { label: app.runtime.manifest.name, icon: 'list-todo' },
  sections: [
    {
      id: 'main',
      items: [
        { id: 'items', label: 'Items', href: router.href('/'), icon: 'list-todo', exact: true },
        { id: 'new', label: 'New', href: router.href('/items/new'), icon: 'plus' },
        { id: 'profile', label: 'Profile', href: router.href('/profile'), icon: 'user' },
      ],
    },
  ],
  ...(principal.current
    ? {
        user: {
          name: principal.current.persona.name,
          detail: principal.current.persona.title,
          image: avatarImage(principal.current.persona.avatar),
        },
      }
    : {}),
} satisfies NavModel);
</script>

<!--
  The shell is exactly one app-height tall (--tx-app-height: the window, or the
  device screen inside a shell frame). Only <main> scrolls, and the bottom nav
  sits in normal flow below it, so it is always visible. On a desktop window,
  ShellHost frames the app as a phone (platform "mobile").
-->
<LayoutHost layout={appearance.current.layout.value} {nav} storageKey={app.runtime.manifest.storage.namespace}>
  <Router {router} />
</LayoutHost>
