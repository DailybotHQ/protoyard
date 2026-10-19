<script lang="ts">
import { createRouter, Router, useAppearance } from '@protoyard/renderer-svelte';
import { LayoutHost, type NavModel } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import AppHeader from './components/AppHeader.svelte';
import { provideOnboarding } from './lib/context.ts';
import Home from './screens/Home.svelte';
import Onboarding from './screens/Onboarding.svelte';

const { runtime } = provideOnboarding();
const appearance = useAppearance();

/**
 * Two routes: the wizard and the post-onboarding home. Home sends anyone who
 * has not finished onboarding to the wizard. Add screens here.
 */
const router = createRouter(
  [
    { path: '/', component: Home, title: 'Home' },
    { path: '/onboarding', component: Onboarding, title: 'Get started' },
  ],
  { titleSuffix: runtime.manifest.name }
);
onDestroy(() => router.destroy());
const nav = {
  brand: { label: runtime.manifest.name, icon: 'sparkles' },
  sections: [
    {
      id: 'onboarding',
      items: [
        { id: 'home', label: 'Home', href: '#/', icon: 'home', exact: true },
        { id: 'get-started', label: 'Get started', href: '#/onboarding', icon: 'sparkles' },
      ],
    },
  ],
} satisfies NavModel;
</script>

<LayoutHost layout={appearance.current.layout.value} {nav} storageKey={runtime.manifest.storage.namespace}>
  <div class="flex min-h-dvh flex-col bg-background">
    <AppHeader />
    <main id="main" class="w-full flex-1 px-4 py-6 pb-safe sm:px-6 sm:py-10">
    <Router {router} />
    </main>
  </div>
</LayoutHost>
