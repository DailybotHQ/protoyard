<script lang="ts">
import {
  type AppModel,
  type AppRoute,
  type Blueprint,
  createEntityServices,
  deriveAppModel,
  type EntityServices,
} from '@protoyard/blueprint';
import type { PrototypeRuntime } from '@protoyard/core';
import {
  avatarImage,
  createRouter,
  getRuntime,
  Router,
  useAppearance,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { LayoutHost, navFromSidebar } from '@protoyard/ui';
import { onDestroy, onMount } from 'svelte';
import NotificationsBell from '../NotificationsBell.svelte';
import AppSearch from './AppSearch.svelte';
import { provideBlueprintApp, type ThemeLibraryLoader } from './context.ts';
import { NAV_ICONS } from './icons.ts';
import RouteView from './RouteView.svelte';

/**
 * Renders a whole blueprint app from data (ADR-029): the same routes,
 * navigation groups and layout that `protoyard generate` prints, with screens
 * resolved through the screen-kind registry. The blueprint, model and
 * services are read once; mount a new `BlueprintApp` for another blueprint.
 */
let {
  blueprint,
  runtime: runtimeProp,
  services: servicesProp,
  model: modelProp,
  themeLibrary,
}: {
  blueprint: Blueprint;
  /** Defaults to the runtime `mountPrototype` provides. */
  runtime?: PrototypeRuntime;
  services?: EntityServices;
  /** Defaults to `deriveAppModel(blueprint)`. */
  model?: AppModel;
  /** Extra themes for the settings screen, such as the theme library metadata. */
  themeLibrary?: ThemeLibraryLoader;
} = $props();

// svelte-ignore state_referenced_locally
const runtime = runtimeProp ?? getRuntime();
// svelte-ignore state_referenced_locally
const services = servicesProp ?? createEntityServices(runtime, blueprint);
// svelte-ignore state_referenced_locally
const model = modelProp ?? deriveAppModel(blueprint);
// svelte-ignore state_referenced_locally
const app = blueprint;

const byPath = new Map<string, AppRoute>(model.routes.map((route) => [route.path, route]));
const router = createRouter(
  model.routes.map((route) => ({
    path: route.path,
    name: route.name,
    title: route.title,
    description: route.description,
    component: RouteView,
  })),
  { titleSuffix: runtime.manifest.name }
);
onDestroy(() => router.destroy());

provideBlueprintApp({
  runtime,
  services,
  blueprint: app,
  model,
  router,
  routeFor: (path) => (path === undefined ? undefined : byPath.get(path)),
  // svelte-ignore state_referenced_locally
  ...(themeLibrary ? { themeLibrary } : {}),
});

const principal = usePrincipal(runtime);
const appearance = useAppearance(runtime);
const bell = app.entities.some((entity) => entity.features.notifications);

let viewportWidth = $state(typeof window === 'undefined' ? 0 : window.innerWidth);
onMount(() => {
  const updateWidth = () => (viewportWidth = window.innerWidth);
  window.addEventListener('resize', updateWidth);
  return () => window.removeEventListener('resize', updateWidth);
});

const pinned = $derived(
  appearance.current.layout.source === 'override' || appearance.current.layout.source === 'scenario'
);
const activeLayout = $derived(
  model.layout.mobile && viewportWidth > 0 && viewportWidth < 768 && !pinned
    ? model.layout.mobile
    : pinned
      ? appearance.current.layout.value
      : model.layout.id
);
const items = $derived(
  model.nav.map((item) => ({
    href: `#${item.path}`,
    label: item.label,
    icon: NAV_ICONS[item.icon],
    active: router.isActive(item.path, item.exact === true),
  }))
);
const sections = $derived(
  model.navGroups
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
      {#if bell}
        <NotificationsBell {runtime} />
      {/if}
    </div>
    <Router {router} />
  </div>
</LayoutHost>
