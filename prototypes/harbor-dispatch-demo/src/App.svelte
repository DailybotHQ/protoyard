<script lang="ts">
import {
  avatarImage,
  createRouter,
  Router,
  useAppearance,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { LayoutHost, navFromSidebar } from '@protoyard/ui';
import { onDestroy, onMount } from 'svelte';
import AppSearch from './components/AppSearch.svelte';
import { layout, navGroups } from './generated/layout.ts';
import { nav, routes } from './generated/routes.ts';
import { provideCrudApp } from './lib/context.ts';

const { runtime } = provideCrudApp();
const principal = usePrincipal();
const appearance = useAppearance();
let viewportWidth = $state(typeof window === 'undefined' ? 0 : window.innerWidth);

onMount(() => {
  const updateWidth = () => (viewportWidth = window.innerWidth);
  window.addEventListener('resize', updateWidth);
  return () => window.removeEventListener('resize', updateWidth);
});

const router = createRouter([...routes], { titleSuffix: runtime.manifest.name });
onDestroy(() => router.destroy());

const appearanceLayout = $derived(
  appearance.current.layout.source === 'override' || appearance.current.layout.source === 'scenario'
    ? appearance.current.layout.value
    : layout.id
);
const activeLayout = $derived(
  layout.mobile &&
    viewportWidth > 0 &&
    viewportWidth < 768 &&
    appearance.current.layout.source !== 'override' &&
    appearance.current.layout.source !== 'scenario'
    ? layout.mobile
    : appearanceLayout
);
const items = $derived(
  nav.map((item) => ({
    href: `#${item.path}`,
    label: item.label,
    icon: item.icon,
    active: router.isActive(item.path, 'exact' in item && item.exact),
  }))
);
const sections = $derived(
  navGroups
    .map((group) => ({
      label: group.label,
      items: group.paths.flatMap((path) => {
        const item = items.find((candidate) => candidate.href === `#${path}`);
        return item ? [item] : [];
      }),
    }))
    .filter((group) => group.items.length > 0)
);
const layoutNav = $derived(
  navFromSidebar(sections, {
    brand: { label: runtime.manifest.name, icon: 'folder-kanban' },
    ...(principal.current
      ? {
          user: {
            image: avatarImage(principal.current.persona.avatar),
            name: principal.current.persona.name,
            detail: principal.current.persona.title ?? principal.current.role ?? '',
          },
        }
      : {}),
  })
);
</script>

<LayoutHost layout={activeLayout} nav={layoutNav} storageKey={runtime.manifest.storage.namespace}>
  <div class="mx-auto w-full max-w-7xl px-4 py-6 pb-safe sm:px-6 lg:px-8">
    <div class="mb-4 flex justify-end gap-2">
      <AppSearch />
    </div>
    <Router {router} />
  </div>
</LayoutHost>
