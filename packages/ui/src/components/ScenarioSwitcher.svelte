<script lang="ts">
import type { Snippet } from 'svelte';
import { cn } from '../lib/cn.ts';
import Badge from './badge/Badge.svelte';
import Button from './button/Button.svelte';
import EmptyState from './empty-state/EmptyState.svelte';

/**
 * In-app scenario and persona switcher for demos.
 *
 * Presentational only: the caller supplies catalog rows and callbacks
 * (`onLoadScenario`, `onViewAs`). Labelled simulated — this is not multiplayer
 * and does not open DevTools. Wire pending feedback by returning a promise
 * from the callbacks (Button auto-loading) or by setting the loading ids.
 */

export interface ScenarioSwitcherScenario {
  id: string;
  name: string;
  description?: string;
  group: string;
}

export interface ScenarioSwitcherPersona {
  id: string;
  name: string;
  title?: string | null;
  email?: string | null;
}

export interface ScenarioSwitcherGroup {
  name: string;
  scenarios: ScenarioSwitcherScenario[];
}

interface Props {
  /** Scenarios to list (grouped by `group` when `groups` is omitted). */
  scenarios?: readonly ScenarioSwitcherScenario[];
  /** Pre-built groups; wins over `scenarios` when provided. */
  groups?: readonly ScenarioSwitcherGroup[];
  activeScenarioId?: string | null;
  personas?: readonly ScenarioSwitcherPersona[];
  activePersonaId?: string | null;
  /** Scenario id currently loading (disables its Load control). */
  loadingScenarioId?: string | null;
  /** Persona id currently switching (disables its View as control). */
  switchingPersonaId?: string | null;
  /** Called when the viewer loads a scenario. Return a promise for pending UI. */
  onLoadScenario?: (scenarioId: string) => void | Promise<void>;
  /** Called when the viewer acts as another persona. Return a promise for pending UI. */
  onViewAs?: (personaId: string) => void | Promise<void>;
  title?: string;
  description?: string;
  simulatedLabel?: string;
  simulatedTitle?: string;
  loadLabel?: string;
  loadingLabel?: string;
  viewAsHeading?: string;
  youLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Optional header actions (for example a close control). */
  header?: Snippet;
  class?: string;
}

let {
  scenarios = [],
  groups: groupsProp,
  activeScenarioId = null,
  personas = [],
  activePersonaId = null,
  loadingScenarioId = null,
  switchingPersonaId = null,
  onLoadScenario,
  onViewAs,
  title = 'Demo scenarios',
  description = 'Load a world and view it as another persona. Simulated data only — not multiplayer.',
  simulatedLabel = 'Simulated',
  simulatedTitle = 'Changes the demo data world. Not real multiplayer or authentication.',
  loadLabel = 'Load',
  loadingLabel = 'Loading…',
  viewAsHeading = 'View as…',
  youLabel = 'You',
  emptyTitle = 'No scenarios',
  emptyDescription = 'This build has no registered scenarios.',
  header,
  class: className = '',
}: Props = $props();

const groups = $derived.by((): ScenarioSwitcherGroup[] => {
  if (groupsProp && groupsProp.length > 0) return [...groupsProp];
  const map = new Map<string, ScenarioSwitcherScenario[]>();
  for (const row of scenarios) {
    const list = map.get(row.group) ?? [];
    list.push(row);
    map.set(row.group, list);
  }
  return [...map.entries()].map(([name, rows]) => ({ name, scenarios: rows }));
});

const total = $derived(groups.reduce((n, g) => n + g.scenarios.length, 0));
const busy = $derived(loadingScenarioId !== null || switchingPersonaId !== null);

function load(id: string): void | Promise<void> {
  return onLoadScenario?.(id);
}

function viewAs(id: string): void | Promise<void> {
  if (!id || id === activePersonaId) return;
  return onViewAs?.(id);
}
</script>

<section
  class={cn('flex flex-col gap-4', className)}
  data-scenario-switcher
  aria-labelledby="scenario-switcher-title"
>
  <header class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0 space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <h2 id="scenario-switcher-title" class="m-0 text-base font-semibold text-foreground">
          {title}
        </h2>
        <Badge variant="secondary" title={simulatedTitle} data-scenario-switcher-simulated>
          {simulatedLabel}
        </Badge>
      </div>
      {#if description}
        <p class="m-0 text-sm text-muted-foreground">{description}</p>
      {/if}
    </div>
    {#if header}
      <div class="shrink-0">{@render header()}</div>
    {/if}
  </header>

  {#if total === 0}
    <EmptyState title={emptyTitle} description={emptyDescription} size="sm" />
  {:else}
    <div class="flex flex-col gap-6" data-scenario-switcher-groups>
      {#each groups as group (group.name)}
        {@const headingId = `scenario-group-${group.name.replace(/\s+/g, '-').toLowerCase()}`}
        <section class="flex flex-col gap-3" aria-labelledby={headingId} data-scenario-group={group.name}>
          <h3
            id={headingId}
            class="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {group.name}
          </h3>
          <ul class="m-0 flex list-none flex-col gap-3 p-0">
            {#each group.scenarios as row (row.id)}
              {@const active = row.id === activeScenarioId}
              {@const loading = loadingScenarioId === row.id}
              <li
                class={cn(
                  'rounded-xl border bg-card p-4 text-card-foreground shadow-sm',
                  active ? 'border-primary' : 'border-border'
                )}
                data-scenario-id={row.id}
                data-active={active ? 'true' : undefined}
              >
                <div class="flex flex-col gap-3">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0 space-y-1">
                      <p class="m-0 text-sm font-semibold">{row.name}</p>
                      {#if row.description}
                        <p class="m-0 text-sm text-muted-foreground">{row.description}</p>
                      {/if}
                      {#if active}
                        <p class="m-0 text-xs font-semibold text-primary" data-scenario-active-label>
                          Active now
                        </p>
                      {/if}
                    </div>
                    <Button
                      size="sm"
                      variant={active ? 'secondary' : 'default'}
                      loading={loading}
                      loadingLabel={loadingLabel}
                      disabled={busy && !loading}
                      onclick={() => load(row.id)}
                      data-scenario-load={row.id}
                    >
                      {loading ? loadingLabel : loadLabel}
                    </Button>
                  </div>

                  {#if active && personas.length > 0}
                    <div
                      class="flex flex-col gap-2 border-t border-border pt-3"
                      data-scenario-view-as
                    >
                      <p class="m-0 text-xs font-semibold text-muted-foreground">{viewAsHeading}</p>
                      <div class="flex flex-wrap gap-2">
                        {#each personas as person (person.id)}
                          {@const mine = person.id === activePersonaId}
                          {@const switching = switchingPersonaId === person.id}
                          <Button
                            size="sm"
                            variant={mine ? 'default' : 'outline'}
                            loading={switching}
                            disabled={mine || (busy && !switching)}
                            onclick={() => viewAs(person.id)}
                            data-scenario-view-as-id={person.id}
                            aria-pressed={mine}
                          >
                            {mine ? `${youLabel} · ${person.name}` : person.name}
                          </Button>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  {/if}
</section>
