<script lang="ts">
import { agentPrompt, newCommand } from '@/lib/commands';
import CommandBlock from './CommandBlock.svelte';

interface TemplateOption {
  slug: string;
  name: string;
  description: string;
}
let { templates, initialTemplate = '' }: { templates: TemplateOption[]; initialTemplate?: string } =
  $props();

let slug = $state('');
let template = $state(initialTemplate || templates[0]?.slug || '');
let name = $state('');
let description = $state('');
let idea = $state('');

// Mirrors core checkSlug(): lowercase kebab-case, 2–48 chars.
const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const slugError = $derived(
  slug === ''
    ? ''
    : slug.length < 2 || slug.length > 48 || !SLUG_PATTERN.test(slug)
      ? 'Use lowercase kebab-case, 2–48 characters (e.g. "team-crm").'
      : ''
);
const command = $derived(newCommand({ slug: slugError ? '' : slug, template, name, description }));
const prompt = $derived(agentPrompt({ slug: slugError ? '' : slug, template, idea }));

function suggestSlug() {
  if (slug || !name) return;
  slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[^a-z]+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

const input = 'h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm';
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
  <form class="space-y-4 rounded-xl border border-line bg-surface p-5" onsubmit={(e) => e.preventDefault()} aria-describedby="builder-note">
    <p id="builder-note" class="text-sm text-muted">
      This page cannot create files — it builds the exact command to run in your terminal (or to give your coding agent).
    </p>
    <label class="block space-y-1.5">
      <span class="text-sm font-medium">Display name</span>
      <input class={input} bind:value={name} onblur={suggestSlug} placeholder="Team CRM" maxlength="80" />
    </label>
    <label class="block space-y-1.5">
      <span class="text-sm font-medium">Slug <span class="font-normal text-muted">(folder name and URL)</span></span>
      <input class={[input, 'font-mono']} bind:value={slug} placeholder="team-crm" aria-invalid={slugError !== ''} aria-describedby="slug-help" spellcheck="false" autocomplete="off" />
      <span id="slug-help" class={['block text-xs', slugError ? 'text-danger' : 'text-muted']}>{slugError || 'Created at prototypes/<slug>/.'}</span>
    </label>
    <fieldset class="space-y-2">
      <legend class="text-sm font-medium">Template</legend>
      {#if templates.length === 0}
        <p class="text-sm text-warning">No templates are indexed yet. Run <code class="font-mono">pnpm protoyard index</code>.</p>
      {/if}
      {#each templates as option (option.slug)}
        <label class="flex cursor-pointer gap-3 rounded-lg border border-line p-3 has-checked:border-accent has-checked:bg-accent-soft">
          <input type="radio" name="template" value={option.slug} bind:group={template} class="mt-1 accent-[var(--py-accent)]" />
          <span>
            <span class="block text-sm font-medium">{option.name} <span class="font-mono text-xs text-muted">{option.slug}</span></span>
            <span class="block text-xs text-muted">{option.description}</span>
          </span>
        </label>
      {/each}
    </fieldset>
    <label class="block space-y-1.5">
      <span class="text-sm font-medium">Description <span class="font-normal text-muted">(optional)</span></span>
      <input class={input} bind:value={description} maxlength="280" placeholder="Pipeline and accounts for a small sales team" />
    </label>
    <label class="block space-y-1.5">
      <span class="text-sm font-medium">Idea for your agent <span class="font-normal text-muted">(optional)</span></span>
      <textarea class={[input, 'h-24 py-2']} bind:value={idea} placeholder="Who uses it, what they do, which flows matter…"></textarea>
    </label>
  </form>
  <div class="space-y-4">
    <CommandBlock label="1. Run in the repository root" {command} />
    <CommandBlock label="2. Then start it" command={`pnpm protoyard dev ${slug && !slugError ? slug : '<slug>'}`} />
    <CommandBlock label="Or paste this prompt into your coding agent" command={prompt} multiline />
  </div>
</div>
