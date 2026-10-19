<script lang="ts">
import { createRouter, Router, useAppearance, usePrincipal } from '@protoyard/renderer-svelte';
import { LayoutHost, type NavModel } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { provideFintech } from './lib/context.ts';
import Finances from './screens/Finances.svelte';

const { runtime } = provideFintech();
const principal = usePrincipal();
const appearance = useAppearance();
const router = createRouter([{ path: '/', component: Finances, title: 'Overview' }], {
  titleSuffix: runtime.manifest.name,
});
onDestroy(() => router.destroy());

const nav = $derived({
  brand: { label: 'Northstar', href: '#/', icon: 'chart-column' },
  sections: [
    {
      id: 'money',
      items: [
        { id: 'overview', label: 'Overview', href: '#/', icon: 'layout-dashboard', exact: true },
      ],
    },
  ],
  user: principal.current
    ? { name: principal.current.persona.name, detail: principal.current.role ?? 'Member' }
    : undefined,
} satisfies NavModel);
</script>

<LayoutHost
  layout={appearance.current.layout.value}
  nav={nav}
  storageKey={runtime.manifest.storage.namespace}
>
  <div class="mx-auto w-full max-w-7xl px-4 py-6 pb-safe sm:px-6 lg:px-8">
    <Router {router} />
  </div>
</LayoutHost>
