<script lang="ts">
import { ArrowRight, CircleDashed, Clock3, Layers3, Users, Zap } from '@lucide/svelte';
import { getRuntime, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import type { B2bSaasDatabase } from '../database/schema.ts';

const runtime = getRuntime<B2bSaasDatabase>();
const principal = usePrincipal(runtime);
const canCreateProject = $derived(
  runtime.session.can('projects:create', {
    organizationId: principal.current?.organization?.id,
  })
);
const projects = liveQuery(
  () =>
    runtime.db.projects
      .where('organizationId')
      .equals(principal.current?.organization?.id ?? '')
      .toArray(),
  { initial: [], deps: () => [principal.current?.organization?.id] }
);
const projectRows = $derived(projects.current ?? []);
const activeCount = $derived(projectRows.filter((project) => project.status === 'active').length);
const planningCount = $derived(
  projectRows.filter((project) => project.status === 'planning').length
);
const completeCount = $derived(
  projectRows.filter((project) => project.status === 'complete').length
);
const recentProjects = $derived(projectRows.slice(0, 4));
const firstName = $derived(principal.current?.persona.name.split(' ')[0] ?? 'there');
</script>

{#if principal.current}
  <section class="space-y-8" aria-labelledby="overview-title">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
      <p class="text-sm font-medium text-primary">Planning overview <span class="text-muted-foreground">· Northstar Studio</span></p>
        <h1 id="overview-title" class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Good morning, {firstName}.</h1>
        <p class="mt-2 max-w-2xl text-muted-foreground">Your team’s work, priorities, and delivery health in one calm place.</p>
      </div>
      {#if canCreateProject}<Button href="#/projects"><Icon icon="plus" size="sm" /> New project</Button>{/if}
    </div>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace project summary">
      <article class="rounded-2xl border border-border bg-surface p-5">
        <div class="flex items-center justify-between text-sm text-muted-foreground"><span>Active projects</span><LucideIcon icon={Layers3} class="size-[18px]" /></div>
        <p class="mt-5 text-3xl font-semibold tabular-nums">{activeCount}</p>
        <p class="mt-1 text-xs text-muted-foreground">Moving forward this week</p>
      </article>
      <article class="rounded-2xl border border-border bg-surface p-5">
        <div class="flex items-center justify-between text-sm text-muted-foreground"><span>In planning</span><LucideIcon icon={CircleDashed} class="size-[18px]" /></div>
        <p class="mt-5 text-3xl font-semibold tabular-nums">{planningCount}</p>
        <p class="mt-1 text-xs text-muted-foreground">Ready for the next milestone</p>
      </article>
      <article class="rounded-2xl border border-border bg-surface p-5">
        <div class="flex items-center justify-between text-sm text-muted-foreground"><span>Completed</span><Icon icon="check" size="md" /></div>
        <p class="mt-5 text-3xl font-semibold tabular-nums">{completeCount}</p>
        <p class="mt-1 text-xs text-muted-foreground">Delivered in this workspace</p>
      </article>
      <article class="rounded-2xl border border-border bg-primary p-5 text-primary-foreground">
        <div class="flex items-center justify-between text-sm opacity-80"><span>Team momentum</span><LucideIcon icon={Zap} class="size-[18px]" /></div>
        <p class="mt-5 text-3xl font-semibold">On track</p>
        <p class="mt-1 text-xs opacity-80">Based on your current project board</p>
      </article>
    </div>

    <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(17rem,0.8fr)]">
      <section class="overflow-hidden rounded-2xl border border-border bg-surface" aria-labelledby="projects-title">
        <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div><h2 id="projects-title" class="font-semibold">Project portfolio</h2><p class="mt-1 text-sm text-muted-foreground">A live view of work in this workspace.</p></div>
          <a class="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" href="#/projects">All projects <LucideIcon icon={ArrowRight} class="size-[15px]" /></a>
        </header>
        {#if projects.error}
          <p class="p-6 text-sm text-destructive" role="alert">Could not load projects: {String(projects.error)}</p>
        {:else if projects.loading}
          <p class="p-6 text-sm text-muted-foreground" role="status">Loading your portfolio…</p>
        {:else if recentProjects.length}
          <ul class="divide-y divide-border">
            {#each recentProjects as project (project.id)}
              <li class="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
                <div class="flex min-w-0 items-start gap-3">
                  <span class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-primary"><LucideIcon icon={Layers3} class="size-[17px]" /></span>
                  <div class="min-w-0"><h3 class="truncate font-medium">{project.name}</h3><p class="mt-1 line-clamp-1 text-sm text-muted-foreground">{project.summary || 'Project workspace'}</p></div>
                </div>
                <div class="flex items-center gap-4 text-sm">
                  <span class="inline-flex items-center gap-1.5 text-muted-foreground">
                    {#if project.status === 'active'}<span class="size-2 rounded-full bg-emerald-500"></span>{project.status}
                    {:else if project.status === 'complete'}<Icon icon="check" size="xs" class="text-emerald-600" />{project.status}
                    {:else}<LucideIcon icon={Clock3} class="size-[14px]" />{project.status}{/if}
                  </span>
                  <a class="font-medium text-primary hover:underline" href="#/projects" aria-label={`Open ${project.name}`}>Open</a>
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="px-6 py-12 text-center"><p class="font-medium">Your portfolio starts here</p><p class="mt-1 text-sm text-muted-foreground">Create a project to give the team a shared plan.</p>{#if canCreateProject}<Button class="mt-4" href="#/projects"><Icon icon="plus" size="sm" /> Create a project</Button>{/if}</div>
        {/if}
      </section>

      <aside class="space-y-4">
        <section class="rounded-2xl border border-border bg-surface p-5">
          <div class="flex items-center gap-2"><LucideIcon icon={Users} class="size-[18px] text-primary" /><h2 class="font-semibold">Bring your team in</h2></div>
          <p class="mt-2 text-sm leading-6 text-muted-foreground">Invite a teammate, choose a simulated role, and see the collaboration flow in action.</p>
          <a class="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline" href="#/settings/members">Manage members <LucideIcon icon={ArrowRight} class="size-[15px]" /></a>
        </section>
        <section class="rounded-2xl border border-border bg-muted/50 p-5">
          <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your workspace</p>
          <h2 class="mt-2 text-lg font-semibold">{principal.current.organization?.name ?? 'Lattice workspace'}</h2>
          <p class="mt-1 text-sm text-muted-foreground">A shared space for planning, progress, and better team decisions.</p>
          <a class="mt-4 inline-flex items-center gap-2 text-sm font-medium hover:underline" href="#/settings">Workspace settings <LucideIcon icon={ArrowRight} class="size-[15px]" /></a>
        </section>
      </aside>
    </div>
    <p class="text-xs text-muted-foreground">This is a local simulation. Project records and role changes stay in this browser.</p>
  </section>
{:else}
  <section class="mx-auto grid max-w-6xl gap-10 py-8 md:grid-cols-[1.1fr_0.9fr] md:items-center lg:py-16">
    <div>
      <p class="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary"><span class="size-1.5 rounded-full bg-primary"></span> A clearer way to plan together</p>
      <h1 class="mt-6 max-w-2xl text-5xl font-semibold tracking-tight sm:text-6xl">Make the next big thing feel <span class="text-primary">manageable.</span></h1>
      <p class="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">Lattice brings projects, priorities, and people into one thoughtful workspace—so every team knows what matters next.</p>
      <div class="mt-7 flex flex-wrap gap-3">
        <a class="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90" href="#/sign-up">Create your workspace <LucideIcon icon={ArrowRight} class="size-[16px] ml-1 inline" /></a>
        <a class="rounded-lg border border-border bg-surface px-5 py-3 text-sm font-semibold hover:bg-muted" href="#/sign-in">Explore a demo account</a>
      </div>
      <p class="mt-4 text-xs text-muted-foreground">No email or payment provider is contacted. This product experience is simulated.</p>
    </div>
    <div class="rounded-3xl border border-border bg-surface p-3 shadow-xl shadow-primary/5">
      <div class="rounded-2xl bg-muted/50 p-5 sm:p-7">
        <div class="flex items-center justify-between gap-3"><div><p class="text-xs font-medium text-muted-foreground">NORTHSTAR STUDIO</p><h2 class="mt-1 text-lg font-semibold">Team overview</h2></div><span class="rounded-full bg-success px-3 py-1 text-xs font-medium text-success-foreground">On track</span></div>
        <div class="mt-6 grid grid-cols-3 gap-3">
          <div class="rounded-xl border border-border bg-surface p-3"><p class="text-xs text-muted-foreground">Projects</p><p class="mt-2 text-2xl font-semibold">04</p></div>
          <div class="rounded-xl border border-border bg-surface p-3"><p class="text-xs text-muted-foreground">In motion</p><p class="mt-2 text-2xl font-semibold">02</p></div>
          <div class="rounded-xl border border-border bg-surface p-3"><p class="text-xs text-muted-foreground">Team</p><p class="mt-2 text-2xl font-semibold">06</p></div>
        </div>
        <div class="mt-4 space-y-3 rounded-xl border border-border bg-surface p-4">
          {#each [{ title: 'Website relaunch', status: 'In progress', width: '72%' }, { title: 'Customer research', status: 'Planning', width: '38%' }, { title: 'Q4 operating plan', status: 'Complete', width: '100%' }] as item (item.title)}
            <div><div class="flex justify-between gap-3 text-sm"><span class="font-medium">{item.title}</span><span class="text-xs text-muted-foreground">{item.status}</span></div><div class="mt-2 h-1.5 rounded-full bg-muted"><div class="h-full rounded-full bg-primary" style={`width:${item.width}`}></div></div></div>
          {/each}
        </div>
      </div>
    </div>
  </section>
{/if}
