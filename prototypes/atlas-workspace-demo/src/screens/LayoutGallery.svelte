<script lang="ts">
import { LAYOUTS } from '@protoyard/core';
import { Badge, Card } from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';

const layouts = LAYOUTS.filter(({ id }) =>
  [
    'sidebar',
    'rail',
    'top-nav',
    'dual-sidebar',
    'master-detail',
    'dashboard-grid',
    'docs',
    'marketing',
    'wizard',
    'auth-split',
  ].includes(id)
);

function layoutHref(id: string, mode: 'light' | 'dark' = 'light') {
  const route = id === 'auth-split' ? '/access' : id === 'wizard' ? '/onboarding' : '/playbook';
  return `/?layout=${id}&mode=${mode}&theme=aurora-analytics#${route}`;
}
</script>

<PageHeader title="Layout gallery" description="One workspace, ten ways to frame its work." />

<p class="mb-6 max-w-3xl text-sm leading-6 text-muted-foreground">
  Choose a frame to reload this guide inside it. The active layout is a shareable URL override;
  the workspace data stays in the same local demo database.
</p>

<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
  {#each layouts as layout (layout.id)}
    <Card class="flex h-full flex-col gap-3 p-5">
      <div class="flex items-start justify-between gap-3">
        <h2 class="font-semibold">{layout.label}</h2>
        <Badge variant="outline">{layout.minWidth ? `${layout.minWidth}px+` : 'Responsive'}</Badge>
      </div>
      <p class="flex-1 text-sm text-muted-foreground">Preview the {layout.label.toLowerCase()} frame with the Atlas playbook route.</p>
      <div class="flex flex-wrap gap-2">
        <a class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2" href={layoutHref(layout.id)}>Light preview</a>
        <a class="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2" href={layoutHref(layout.id, 'dark')}>Dark preview</a>
      </div>
    </Card>
  {/each}
</div>

<Card class="mt-6 p-5">
  <h2 class="font-semibold">Layout fit notes</h2>
  <p class="mt-2 text-sm leading-6 text-muted-foreground">
    Sidebar, rail, top navigation, dual sidebar, master-detail and dashboard grid demonstrate
    workspace chrome. Docs and marketing show content-first pages. Wizard and auth split frame
    the tour and simulated access routes. Narrow viewports use each layout's declared fallback.
  </p>
</Card>
