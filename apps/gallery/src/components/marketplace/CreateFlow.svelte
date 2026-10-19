<script lang="ts">
import LoaderCircle from '@lucide/svelte/icons/loader-circle';
import { onMount } from 'svelte';
import { devCommand } from '@/lib/commands';
import { control, localDevUrl } from '@/lib/control.svelte';
import CommandBlock from '../CommandBlock.svelte';
import { created } from './created.svelte';
import {
  type CreateOutcome,
  createCommand,
  createRequest,
  interpretCreate,
  type MarketKind,
  slugError,
  suggestSlug,
} from './model';

/**
 * "Use this template" / "Remix" / "Use this blueprint". With the local
 * control server it asks for a name and slug, calls POST /api/new and opens
 * the new prototype in its frame. On the hosted read-only gallery (and always
 * for blueprints, which are generated rather than copied) it shows the exact
 * CLI command instead.
 */
let {
  kind,
  slug: sourceSlug,
  name: sourceName,
  shell,
  platform,
}: { kind: MarketKind; slug: string; name: string; shell: string; platform: string } = $props();

const source = $derived({ k: kind, s: sourceSlug });
const verb = $derived(
  kind === 'prototype' ? 'Remix' : kind === 'template' ? 'Use this template' : 'Use this blueprint'
);

let name = $state('');
let slug = $state('');
let touched = $state(false);
let creating = $state(false);
let outcome = $state<CreateOutcome | null>(null);
let hydrated = $state(false);

const error = $derived(touched ? slugError(slug) : '');
const command = $derived(createCommand(source, { slug: slugError(slug) ? '' : slug, name }));
const live = $derived(
  control.status === 'available' && control.createEnabled && kind !== 'blueprint'
);

onMount(() => {
  hydrated = true;
  void control.detect();
});

function onNameBlur() {
  if (!slug && name) slug = suggestSlug(name);
}

async function submit(event: SubmitEvent) {
  event.preventDefault();
  touched = true;
  const request = createRequest(source, { slug, name });
  if (slugError(slug) || !request) return;
  creating = true;
  outcome = null;
  const result = await control.create(request);
  outcome = interpretCreate(result.body, result.ok, localDevUrl);
  creating = false;
  // The framed preview renders full width under the page hero (CreatedPreview).
  created.current =
    outcome.state === 'running'
      ? { slug: outcome.slug, name: name.trim() || outcome.slug, shell, platform }
      : null;
}

const input = 'h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm';
</script>

<section aria-labelledby="create-title" class="rounded-xl border border-line bg-surface p-5" data-hydrated={hydrated}>
  <h2 id="create-title" class="text-lg font-semibold">{verb}</h2>
  <p class="mt-1 text-sm text-muted">
    {#if kind === 'blueprint'}
      Generate a new prototype from this blueprint, then edit it like any other.
    {:else if kind === 'prototype'}
      Copy {sourceName} into a new prototype you own. The original stays untouched.
    {:else}
      Start a new prototype from {sourceName}.
    {/if}
  </p>

  <form class="mt-4 space-y-3" onsubmit={submit} novalidate>
    <label class="block space-y-1.5">
      <span class="text-sm font-medium">Name</span>
      <input class={input} bind:value={name} onblur={onNameBlur} placeholder="Team CRM" maxlength="80" />
    </label>
    <label class="block space-y-1.5">
      <span class="text-sm font-medium">Slug <span class="font-normal text-muted">(folder name and URL)</span></span>
      <input
        class={[input, 'font-mono']}
        bind:value={slug}
        oninput={() => (touched = true)}
        placeholder="team-crm"
        spellcheck="false"
        autocomplete="off"
        aria-invalid={error !== ''}
        aria-describedby="create-slug-help"
        data-testid="create-slug"
      />
      <span id="create-slug-help" class={['block text-xs', error ? 'text-danger' : 'text-muted']}>
        {error || 'Created at prototypes/<slug>/.'}
      </span>
    </label>

    {#if live}
      <button
        type="submit"
        class="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
        disabled={creating}
        data-testid="create-submit"
      >
        {#if creating}<LoaderCircle size={14} class="animate-spin" aria-hidden="true" /> Creating…{:else}{verb}{/if}
      </button>
    {:else}
      <p class="text-sm text-muted">
        {#if kind === 'blueprint'}
          Blueprints are generated from the terminal:
        {:else if control.status === 'checking' || control.status === 'unknown'}
          Looking for the local control server… Meanwhile, the same action from your terminal:
        {:else if control.status === 'available'}
          Creating prototypes from the gallery is off (it writes files on this machine). Start the
          gallery with <code class="font-mono">pnpm protoyard gallery --allow-create</code> to enable
          it, or run:
        {:else}
          This gallery is read-only here. Run it from your terminal:
        {/if}
      </p>
      <CommandBlock {command} />
    {/if}
  </form>

  <div aria-live="polite" class="mt-4">
    {#if outcome?.state === 'running'}
      <div class="space-y-3" data-testid="create-outcome" data-state="running">
        <p class="text-sm text-success">Created and running: prototypes/{outcome.slug}</p>
        <a class="text-sm text-accent-fg underline underline-offset-2" href="#create-preview-title">
          Open its live preview above
        </a>
      </div>
    {:else if outcome?.state === 'created'}
      <div class="space-y-2" data-testid="create-outcome" data-state="created">
        <p class="text-sm">Created prototypes/{outcome.slug}, but it is not running: {outcome.error}</p>
        <CommandBlock command={devCommand(outcome.slug)} />
      </div>
    {:else if outcome?.state === 'needs-install'}
      <div class="space-y-2" data-testid="create-outcome" data-state="needs-install">
        <p class="text-sm">Created prototypes/{outcome.slug}. {outcome.next}</p>
        <CommandBlock command={outcome.command} />
      </div>
    {:else if outcome?.state === 'failed'}
      <p class="text-sm text-danger" role="alert" data-testid="create-outcome" data-state="failed">{outcome.error}</p>
    {/if}
  </div>
</section>
