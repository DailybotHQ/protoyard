<script lang="ts">
import { can, createRouter, Router, useAppearance, usePrincipal } from '@protoyard/renderer-svelte';
import { LayoutHost, type NavModel, type NavModelItem } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { CAPABILITIES } from './domain/policy.ts';
import { provideCourseLms } from './lib/context.ts';
import CourseCatalog from './screens/CourseCatalog.svelte';
import InstructorDashboard from './screens/InstructorDashboard.svelte';

const { runtime } = provideCourseLms();
const principal = usePrincipal();
const appearance = useAppearance();
const router = createRouter(
  [
    { path: '/', component: CourseCatalog, title: 'Course catalog' },
    { path: '/instructor', component: InstructorDashboard, title: 'Instructor overview' },
  ],
  { titleSuffix: runtime.manifest.name }
);
onDestroy(() => router.destroy());

const nav = $derived.by(() => {
  const items: NavModelItem[] = [
    { id: 'catalog', label: 'Course catalog', href: '#/', icon: 'book-open', exact: true },
  ];
  if (can(CAPABILITIES.analyticsRead)) {
    items.push({
      id: 'instructor',
      label: 'Instructor overview',
      href: '#/instructor',
      icon: 'chart-column',
    });
  }
  return {
    brand: { label: 'Fieldnote Academy', href: '#/', icon: 'graduation-cap' },
    sections: [{ id: 'academy', items }],
    user: principal.current
      ? { name: principal.current.persona.name, detail: principal.current.role ?? 'Learner' }
      : undefined,
  } satisfies NavModel;
});
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
