<script lang="ts">
import { FileQuestion } from '@lucide/svelte';
import {
  can,
  isValidationError,
  Link,
  liveQuery,
  navigate,
  type RouteProps,
  runService,
} from '@protoyard/renderer-svelte';
import { Button, EmptyState, FormField, Input, Skeleton } from '@protoyard/ui';
import { MarkdownEditor } from '@protoyard/views-ui/editor';
import { CAPABILITIES } from '../domain/policy.ts';
import { BODY_MAX, TITLE_MAX } from '../domain/validation.ts';
import { useWiki } from '../lib/context.ts';

/**
 * The editor (its own lazy route chunk): title plus the views-ui Markdown
 * editor with a split live preview rendered by the safe parser. Saving adds a
 * version; if someone saved meanwhile, the save is refused and nothing is lost
 * from the editor.
 */
let { params }: RouteProps = $props();
const { db, services } = useWiki();
const id = () => params.id ?? '';
const page = liveQuery(() => db.pages.get(id()), { deps: id });

let title = $state('');
let body = $state('');
let baseVersion = $state(0);
let loadedFor = $state('');
let errors = $state<Record<string, string>>({});
$effect(() => {
  // Load once per page: live updates never overwrite what is being typed.
  const p = page.current;
  if (p && loadedFor !== p.id) {
    loadedFor = p.id;
    title = p.title;
    body = p.body;
    baseVersion = p.version;
    errors = {};
  }
});
const dirty = $derived(
  page.current !== undefined && (title !== page.current.title || body !== page.current.body)
);

const save = async () => {
  const r = await runService(() => services.pages.save(id(), { title, body, baseVersion }), {
    success: 'Page saved',
  });
  if (r.ok) navigate(`/pages/${id()}`);
  else if (isValidationError(r.error)) errors = r.error.issues;
};
</script>

{#if page.current === undefined && page.loading}
  <Skeleton class="h-96 w-full" />
{:else if !page.current}
  <EmptyState icon={FileQuestion} title="Page not found" description="It may have been deleted, or it is not in the loaded scenario.">
    {#snippet action()}<Button href="#/" variant="outline">Home</Button>{/snippet}
  </EmptyState>
{:else if !can(CAPABILITIES.pagesEdit)}
  <EmptyState title="Read-only" description="Your role can read and search pages, but not edit them.">
    {#snippet action()}<Button href="#/pages/{id()}" variant="outline">Back to the page</Button>{/snippet}
  </EmptyState>
{:else}
  <header class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Edit page</h1>
      <p class="text-sm text-muted-foreground">Editing version {baseVersion}. Saving adds version {baseVersion + 1}{dirty ? '' : ' (no changes yet)'}.</p>
    </div>
    <div class="flex gap-2">
      <Button variant="ghost" href="#/pages/{page.current.id}">Cancel</Button>
      <Button onclick={save} disabled={!dirty}>Save</Button>
    </div>
  </header>
  <div class="grid gap-4">
    <FormField label="Title" required error={errors.title}>
      {#snippet children(control)}<Input {...control.props} bind:value={title} maxlength={TITLE_MAX} autocomplete="off" />{/snippet}
    </FormField>
    {#if errors.body}
      <p role="alert" class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground">{errors.body}</p>
    {/if}
    <MarkdownEditor bind:value={body} label="Page content" layout="split" maxLength={BODY_MAX} rows={18} placeholder="# Heading&#10;&#10;Write in Markdown." />
    <p class="text-xs text-muted-foreground">
      Markdown only. HTML, scripts and unsafe links are shown as text in the preview and on the page. <Link href="/pages/{page.current.id}/history" class="underline">See the history</Link>.
    </p>
  </div>
{/if}
