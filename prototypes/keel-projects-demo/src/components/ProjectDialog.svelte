<script lang="ts">
import { isValidationError, navigate, runService } from '@protoyard/renderer-svelte';
import {
  Button,
  Dialog,
  FormField,
  Input,
  RadioGroup,
  RadioGroupItem,
  Textarea,
} from '@protoyard/ui';
import { PROJECT_COLORS, type Project, type ProjectColor } from '../database/schema.ts';
import { PROJECT_COLOR_CLASSES } from '../domain/tasks.ts';
import { useWorkspace } from '../lib/context.svelte.ts';

/** Create (no `project`) or edit a project. Field errors come from the service's zod schema. */
let { open = $bindable(false), project = null }: { open?: boolean; project?: Project | null } =
  $props();

const { services } = useWorkspace();

let name = $state('');
let key = $state('');
let description = $state('');
let color = $state<ProjectColor>('violet');
let keyTouched = $state(false);
let errors = $state<Record<string, string>>({});
let saving = $state(false);

$effect(() => {
  if (open) {
    name = project?.name ?? '';
    key = project?.key ?? '';
    description = project?.description ?? '';
    color = project?.color ?? 'violet';
    keyTouched = Boolean(project);
    errors = {};
  }
});

/** Suggest a key from the name until the user edits the key themselves. */
function suggestKey(value: string) {
  if (keyTouched) return;
  const words = value.trim().split(/\s+/).filter(Boolean);
  const guess = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? '').slice(0, 3);
  key = guess
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 5)
    .toUpperCase();
}

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  errors = {};
  const input = { name, key, description, color };
  const result = await runService<unknown>(
    () => (project ? services.projects.update(project.id, input) : services.projects.create(input)),
    { success: project ? 'Project updated' : 'Project created' }
  );
  saving = false;
  if (result.ok) {
    open = false;
    if (!project && result.value) navigate(`/projects/${(result.value as Project).id}`);
  } else if (isValidationError(result.error)) {
    errors = result.error.issues;
  }
}
</script>

<Dialog bind:open title={project ? 'Edit project' : 'New project'} description="Projects group tasks on their own board.">
  <form id="project-form" class="grid gap-4 sm:grid-cols-[1fr_8rem]" onsubmit={submit} novalidate>
    <FormField label="Name" required error={errors.name}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={name} oninput={() => suggestKey(name)} placeholder="e.g. Website relaunch" autocomplete="off" maxlength={60} />
      {/snippet}
    </FormField>
    <FormField label="Key" required error={errors.key} description="Task prefix">
      {#snippet children(control)}
        <Input {...control.props} bind:value={key} oninput={() => (keyTouched = true)} placeholder="WEB" autocomplete="off" maxlength={5} class="font-mono uppercase" />
      {/snippet}
    </FormField>
    <FormField label="Description" error={errors.description} class="sm:col-span-2">
      {#snippet children(control)}
        <Textarea {...control.props} bind:value={description} rows={3} maxlength={280} placeholder="What is this project about?" />
      {/snippet}
    </FormField>
    <fieldset class="sm:col-span-2">
      <legend class="text-sm font-medium">Color</legend>
      <RadioGroup bind:value={color} name="project-color" aria-label="Color" orientation="horizontal" class="mt-2 flex flex-wrap gap-2">
        {#each PROJECT_COLORS as option (option)}
          <RadioGroupItem value={option} aria-label={option} class={[
            'size-8 rounded-full border-2 border-transparent ring-offset-2 ring-offset-background focus-visible:outline-2 focus-visible:outline-ring data-[state=checked]:ring-2 data-[state=checked]:ring-ring',
            PROJECT_COLOR_CLASSES[option].dot,
          ]} />
        {/each}
      </RadioGroup>
    </fieldset>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="project-form" loading={saving}>{project ? 'Save changes' : 'Create project'}</Button>
  {/snippet}
</Dialog>
