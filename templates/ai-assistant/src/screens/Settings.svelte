<script lang="ts">
import { ArrowLeft, Database, Save, ShieldCheck, Sparkles } from '@lucide/svelte';
import { Button, Checkbox, Input, Notice, Select, Textarea } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Heading, Text } from 'texuli/typography';
import { useAssistant } from '../lib/context.ts';

const { settings, services } = useAssistant();
let customInstructions = $state('');
let memory = $state('');
let memoryEnabled = $state(true);
let dataControls = $state<'standard' | 'private'>('standard');
let monthlyLimit = $state(1_000_000);
let notice = $state('');
let noticeIsError = $state(false);
let currentSettingsAt = '';

$effect(() => {
  const current = settings.current;
  if (!current || current.updatedAt === currentSettingsAt) return;
  currentSettingsAt = current.updatedAt;
  customInstructions = current.customInstructions;
  memory = current.memory;
  memoryEnabled = current.memoryEnabled;
  dataControls = current.dataControls;
  monthlyLimit = current.monthlyLimit;
});

async function save(event: SubmitEvent) {
  event.preventDefault();
  notice = '';
  try {
    await services.saveSettings({
      customInstructions,
      memory,
      memoryEnabled,
      dataControls,
      monthlyLimit: Number(monthlyLimit),
    });
    notice = 'Settings saved in this prototype workspace.';
    noticeIsError = false;
  } catch (error) {
    notice = error instanceof Error ? error.message : 'Settings could not be saved.';
    noticeIsError = true;
  }
}

async function clearWorkspace() {
  if (
    !window.confirm(
      'Clear this local prototype workspace? Its projects, conversations and messages will be removed from this browser.'
    )
  )
    return;
  try {
    await services.clearWorkspace();
    notice = 'Local workspace data cleared. Reload or choose a scenario to start again.';
    noticeIsError = false;
  } catch (error) {
    notice = error instanceof Error ? error.message : 'Workspace data could not be cleared.';
    noticeIsError = true;
  }
}

async function clearMemory() {
  try {
    await services.clearMemory();
    notice = 'Saved memory cleared.';
    noticeIsError = false;
  } catch (error) {
    notice = error instanceof Error ? error.message : 'Memory could not be cleared.';
    noticeIsError = true;
  }
}
</script>

<Box as="section" surface="default" border="default" radius="xl" elevation="sm" padding="lg" class="mx-auto max-h-full w-full max-w-3xl overflow-y-auto sm:p-8" aria-labelledby="settings-title">
  <Button href="#/" variant="ghost" size="sm" class="mb-6 min-h-9 gap-1.5 px-2"><LucideIcon icon={ArrowLeft} class="size-3.5" /> Back to assistant</Button>
  <div class="mb-7 flex items-start gap-3">
    <Box surface="muted" radius="lg" padding="none" class="flex size-11 shrink-0 items-center justify-center"><LucideIcon icon={Sparkles} tone="primary" class="size-5" /></Box>
    <div><Heading level={1} size="lg" id="settings-title">Assistant settings</Heading><Text size="sm" tone="muted" class="mt-1">Personalize the simulated assistant and control what this local prototype remembers.</Text></div>
  </div>
  {#if notice}<Notice tone={noticeIsError ? 'error' : 'success'} text={notice} class="mb-5" />{/if}

  <form onsubmit={save} class="space-y-7">
    <section class="space-y-4" aria-labelledby="behavior-title">
      <Box border="block-end" radius="none" padding="none" class="pb-3"><Heading level={2} size="sm" id="behavior-title">How it responds</Heading><Text size="xs" tone="muted" class="mt-1">These instructions are applied locally to deterministic response packs.</Text></Box>
      <div>
        <Text as="label" size="xs" weight="medium" for="custom-instructions">Custom instructions</Text>
        <Textarea id="custom-instructions" bind:value={customInstructions} maxlength={1200} rows={4} class="mt-2 w-full" aria-describedby="custom-instructions-hint"></Textarea>
        <Text as="span" size="xs" tone="muted" id="custom-instructions-hint" class="mt-1 block">Up to 1,200 characters. No external model receives this text.</Text>
      </div>
    </section>

    <section class="space-y-4" aria-labelledby="memory-title">
      <Box border="block-end" radius="none" padding="none" class="pb-3"><Heading level={2} size="sm" id="memory-title">Memory</Heading><Text size="xs" tone="muted" class="mt-1">Stored in this prototype's IndexedDB. Simulated roles are UX only, not security.</Text></Box>
      <label class="flex items-center gap-3"><Checkbox bind:checked={memoryEnabled} class="size-4" /><Text as="span" size="sm">Use saved memory in simulated replies</Text></label>
      <div>
        <Text as="label" size="xs" weight="medium" for="memory-content">Saved memory</Text>
        <Textarea id="memory-content" bind:value={memory} maxlength={1200} rows={3} class="mt-2 w-full"></Textarea>
      </div>
      <Button type="button" variant="ghost" size="sm" class="min-h-9 px-3" onclick={clearMemory}>Clear saved memory</Button>
    </section>

    <section class="space-y-4" aria-labelledby="data-title">
      <Box border="block-end" radius="none" padding="none" class="pb-3"><Heading level={2} size="sm" id="data-title" class="flex items-center gap-2"><LucideIcon icon={ShieldCheck} tone="primary" class="size-4" /> Data controls</Heading><Text size="xs" tone="muted" class="mt-1">Local simulation controls; no account or provider service is connected.</Text></Box>
      <div>
        <Text as="label" size="xs" weight="medium" for="data-mode">Context mode</Text>
        <Select id="data-mode" bind:value={dataControls} class="mt-2 block min-h-10 w-full" items={[{ value: 'standard', label: 'Standard · include enabled memory' }, { value: 'private', label: 'Private · omit saved memory from prompts' }]} />
      </div>
      <div>
        <Text as="label" size="xs" weight="medium" for="usage-limit">Monthly simulated token limit</Text>
        <Input id="usage-limit" type="number" min={1000} max={10000000} step={1000} bind:value={monthlyLimit} class="mt-2 block min-h-10 w-full" />
      </div>
      <Box surface="subtle" border="default" radius="lg" padding="sm"><Text size="xs" tone="muted"><LucideIcon icon={Database} class="mr-1 inline size-3.5" /> Conversations, settings, usage and attachments (file names only) stay in this browser's IndexedDB. The assistant uses deterministic response packs and makes no network model calls.</Text></Box>
    </section>

    <Box border="block-start" radius="none" padding="none" class="flex flex-wrap items-center justify-between gap-3 pt-5">
      <Button type="submit" variant="default" class="min-h-10 gap-2 px-4"><LucideIcon icon={Save} class="size-4" /> Save settings</Button>
      <Button type="button" variant="outline" tone="destructive" size="sm" class="min-h-10 px-3" onclick={clearWorkspace}>Clear local workspace data</Button>
    </Box>
  </form>
</Box>
