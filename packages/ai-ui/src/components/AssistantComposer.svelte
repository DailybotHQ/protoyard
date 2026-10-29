<script lang="ts">
import { Paperclip } from '@lucide/svelte';
import { AI_MODELS, type AiModel } from '@protoyard/ai';
import { Composer } from '@texuli/chat';
import { Tag } from 'texuli/badge';
import { Button, IconButton } from 'texuli/button';
import { LucideIcon } from 'texuli/icons/lucide';
import { Input } from 'texuli/input';
import { Select } from 'texuli/select';
import type { AssistantSendInput } from '../types.ts';

interface Props {
  models?: readonly AiModel[];
  modelId?: string;
  value?: string;
  streaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  slashCommands?: readonly string[];
  mentions?: readonly { id: string; label: string }[];
  onModelChange?: (modelId: string) => void;
  onSubmit: (input: AssistantSendInput) => unknown;
  onStop?: () => void;
}

let {
  models = AI_MODELS,
  modelId = models[0]?.id ?? '',
  value = $bindable(''),
  streaming = false,
  disabled = false,
  placeholder = 'Ask anything',
  slashCommands = ['/summarize', '/brainstorm', '/explain'],
  mentions = [],
  onModelChange,
  onSubmit,
  onStop,
}: Props = $props();

let files = $state<File[]>([]);
let picked = $state<FileList | null>(null);
let picker = $state<HTMLElement | null>(null);
let root = $state<HTMLDivElement | null>(null);
let activeSuggestion = $state(0);
const modelItems = $derived(
  models.map((model) => ({ value: model.id, label: `${model.name} · Simulated` }))
);
const trigger = $derived(/(?:^|\s)([/@][\w-]*)$/.exec(value));
const suggestions = $derived.by(() => {
  if (!trigger?.[1]) return [];
  const token = trigger[1].toLowerCase();
  if (token.startsWith('/')) {
    return slashCommands
      .filter((command) => command.toLowerCase().startsWith(token))
      .slice(0, 6)
      .map((command) => ({ id: command, label: command, kind: 'command' as const }));
  }
  return mentions
    .filter((mention) => mention.label.toLowerCase().startsWith(token.slice(1)))
    .slice(0, 6)
    .map((mention) => ({ ...mention, kind: 'mention' as const }));
});
const selectedModel = $derived(models.find((model) => model.id === modelId));

function chooseSuggestion(item: (typeof suggestions)[number]): void {
  if (!trigger?.[1]) return;
  const start = value.lastIndexOf(trigger[1]);
  const insertion = item.kind === 'mention' ? `@${item.label} ` : `${item.label} `;
  value = `${value.slice(0, start)}${insertion}`;
  activeSuggestion = 0;
  requestAnimationFrame(() => root?.querySelector('textarea')?.focus());
}

/** The composer sends the trimmed text; the model and attachments travel with it. */
async function send(prompt: string): Promise<unknown> {
  if (!selectedModel) return false;
  const result = await onSubmit({ prompt, model: selectedModel, attachments: files });
  if (result !== false) files = [];
  return result;
}

/** The suggestion list takes the arrows and Enter; Texuli's Composer keeps Enter to send and Escape to stop. */
function handleKeydown(event: KeyboardEvent): void {
  if (!suggestions.length) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeSuggestion = (activeSuggestion + 1) % suggestions.length;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeSuggestion = (activeSuggestion - 1 + suggestions.length) % suggestions.length;
  } else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    const item = suggestions[activeSuggestion];
    if (item) chooseSuggestion(item);
  }
}

function addFiles(event: Event): void {
  const input = event.currentTarget;
  if (input instanceof HTMLInputElement && input.files)
    files = [...files, ...Array.from(input.files)];
  picked = null;
}
</script>

<!--
  @texuli/chat's Composer: Enter to send, Shift+Enter for a new line, Stop and
  Escape while a reply streams, pending and error states. ai-ui adds the
  slash/mention list (through its keydown hook), attachments and the model
  choice (through its attachments and actions snippets).
-->
<div bind:this={root} class="@container relative mx-auto w-full max-w-3xl">
  {#if suggestions.length}
    <div class="absolute bottom-full left-3 z-10 mb-2 max-h-52 w-64 overflow-y-auto rounded-xl border border-border bg-elevated p-1 shadow-float" role="listbox" aria-label={trigger?.[1]?.startsWith('/') ? 'Slash commands' : 'People'}>
      {#each suggestions as item, index (`${item.kind}-${item.id}`)}
        <Button variant="ghost" role="option" aria-selected={index === activeSuggestion} class={`w-full justify-start ${index === activeSuggestion ? 'bg-muted' : ''}`} onclick={() => chooseSuggestion(item)}>{item.kind === 'mention' ? `@${item.label}` : item.label}</Button>
      {/each}
    </div>
  {/if}
  <Composer
    bind:value
    onSubmit={send}
    {streaming}
    {onStop}
    disabled={disabled || !selectedModel}
    maxRows={8}
    onkeydown={handleKeydown}
    labels={{
      input: 'Message the simulated assistant',
      placeholder,
      hint: 'Press Enter to send. Shift plus Enter starts a new line. Type slash for commands or at sign to mention a person.',
      send: 'Send message',
      sending: 'Sending message',
      stop: 'Stop response',
      sendError: 'The message could not be sent. Your draft is still here.',
    }}
    class="rounded-3xl bg-surface shadow-soft"
  >
    {#snippet attachments()}
      <IconButton variant="ghost" class="rounded-full" label="Attach files" {disabled} onclick={() => picker?.click()}>
        <LucideIcon icon={Paperclip} size="sm" />
      </IconButton>
      <Input type="file" multiple hidden tabindex={-1} aria-label="Choose attachments" bind:ref={picker} bind:files={picked} onchange={addFiles} />
      {#if files.length}
        <ul class="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Attachments">
          {#each files as file, index (`${file.name}-${index}`)}
            <li><Tag label={file.name} onRemove={() => (files = files.filter((_, itemIndex) => itemIndex !== index))} /></li>
          {/each}
        </ul>
      {/if}
    {/snippet}
    {#snippet actions()}
      <span class="hidden text-[0.7rem] text-muted-foreground @md:inline">Simulated AI · no provider connection</span>
      <label for="assistant-model" class="sr-only">Simulated model</label>
      <Select.Root
        value={modelId}
        items={modelItems}
        disabled={disabled || streaming || !onModelChange}
        onValueChange={(id) => onModelChange?.(id)}
      >
        <Select.Trigger id="assistant-model" aria-label="Simulated model" size="sm" class="min-w-0 max-w-48 rounded-full text-xs text-muted-foreground">
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          {#each modelItems as item (item.value)}
            <Select.Item value={item.value} label={item.label}>{item.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    {/snippet}
  </Composer>
</div>
