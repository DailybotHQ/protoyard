<script lang="ts">
import {
  Bold,
  Code,
  Heading,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  SquareCode,
  Strikethrough,
} from '@lucide/svelte';
import { Button, type IconComponent, Textarea } from '@protoyard/ui';
import {
  applyCompletion,
  continueList,
  insertCodeBlock,
  insertLink,
  setHeading,
  type TextState,
  type TriggerMatch,
  toggleInline,
  toggleLines,
  triggerAt,
} from '@protoyard/views/editor';
import { type Component, onDestroy, tick } from 'svelte';
import { cx } from 'texuli/cx';
import { LucideIcon } from 'texuli/icons/lucide';
import { isMacPlatform, shortcutKeys, shortcutLabel } from '../lib/platform.ts';
import { caretCoordinates } from './caret.ts';
import {
  clearSlashQuery,
  DEFAULT_SLASH_COMMANDS,
  filterSlashCommands,
  type SlashCommand,
  type SlashMatch,
  slashAt,
} from './slash.ts';
import type { EditorSuggestion } from './types.ts';

interface Props {
  /** Markdown text (bindable). */
  value?: string;
  /** Accessible name: "Comment", "Description"… */
  label: string;
  placeholder?: string;
  /** Characters allowed (default 5,000). */
  maxLength?: number;
  /** `tabs` (Write / Preview, the default) or `split` (side by side from `md`). */
  layout?: 'tabs' | 'split';
  /** People for `@` completion. */
  mentions?: readonly EditorSuggestion[];
  /** Records for `#` completion. */
  references?: readonly EditorSuggestion[];
  /** Slash menu entries (`/` at line start). Defaults to block formatting commands. */
  slashCommands?: readonly SlashCommand[];
  /** Called with the text after typing pauses (draft autosave), and once more on unmount. */
  onDraft?: (text: string) => void;
  /** Called after any successful transform (toolbar, shortcut, slash, completion). */
  onChange?: (text: string) => void;
  draftDelayMs?: number;
  rows?: number;
  disabled?: boolean;
  class?: string;
}

let {
  value = $bindable(''),
  label,
  placeholder = 'Write in Markdown…',
  maxLength = 5000,
  layout = 'tabs',
  mentions = [],
  references = [],
  slashCommands = DEFAULT_SLASH_COMMANDS,
  onDraft,
  onChange,
  draftDelayMs = 800,
  rows = 6,
  disabled = false,
  class: className,
}: Props = $props();

const uid = $props.id();
const isMac = isMacPlatform();
let textarea = $state<HTMLElement | null>(null);
const textareaElement = () => textarea as HTMLTextAreaElement | undefined;
let tab = $state<'write' | 'preview'>('write');
let notice = $state('');

// The preview (and the Markdown parser) is its own chunk, fetched the first time it shows.
let Preview = $state<Component<{ source: string; label?: string }> | null>(null);
$effect(() => {
  if (Preview || (layout === 'tabs' && tab !== 'preview')) return;
  void import('./MarkdownPreview.svelte').then((module) => {
    Preview = module.default;
  });
});

interface Tool {
  id: string;
  label: string;
  icon: IconComponent;
  /** `mod+…` shortcut, matched on `event.code` so it works on any keyboard layout. */
  shortcut?: { code: string; shift?: boolean; alt?: boolean; hint: string };
  apply: (state: TextState) => TextState;
}

const TOOLS: Tool[] = [
  {
    id: 'bold',
    label: 'Bold',
    icon: Bold,
    shortcut: { code: 'KeyB', hint: 'mod+b' },
    apply: (s) => toggleInline(s, 'bold'),
  },
  {
    id: 'italic',
    label: 'Italic',
    icon: Italic,
    shortcut: { code: 'KeyI', hint: 'mod+i' },
    apply: (s) => toggleInline(s, 'italic'),
  },
  {
    id: 'strike',
    label: 'Strikethrough',
    icon: Strikethrough,
    shortcut: { code: 'KeyX', shift: true, hint: 'mod+shift+x' },
    apply: (s) => toggleInline(s, 'strike'),
  },
  {
    id: 'code',
    label: 'Inline code',
    icon: Code,
    shortcut: { code: 'KeyE', hint: 'mod+e' },
    apply: (s) => toggleInline(s, 'code'),
  },
  {
    id: 'link',
    label: 'Link',
    icon: Link,
    shortcut: { code: 'KeyK', hint: 'mod+k' },
    apply: (s) => insertLink(s),
  },
  {
    id: 'heading',
    label: 'Heading',
    icon: Heading,
    shortcut: { code: 'Digit2', alt: true, hint: 'mod+alt+2' },
    apply: (s) => setHeading(s, 2),
  },
  {
    id: 'bullet',
    label: 'Bulleted list',
    icon: List,
    shortcut: { code: 'Digit8', shift: true, hint: 'mod+shift+8' },
    apply: (s) => toggleLines(s, 'bullet'),
  },
  {
    id: 'numbered',
    label: 'Numbered list',
    icon: ListOrdered,
    shortcut: { code: 'Digit7', shift: true, hint: 'mod+shift+7' },
    apply: (s) => toggleLines(s, 'numbered'),
  },
  {
    id: 'task',
    label: 'Task list',
    icon: ListChecks,
    shortcut: { code: 'Digit9', shift: true, hint: 'mod+shift+9' },
    apply: (s) => toggleLines(s, 'task'),
  },
  {
    id: 'quote',
    label: 'Quote',
    icon: Quote,
    shortcut: { code: 'Period', shift: true, hint: 'mod+shift+.' },
    apply: (s) => toggleLines(s, 'quote'),
  },
  {
    id: 'codeblock',
    label: 'Code block',
    icon: SquareCode,
    shortcut: { code: 'KeyC', alt: true, hint: 'mod+alt+c' },
    apply: (s) => insertCodeBlock(s),
  },
];

function selection(): TextState {
  return {
    text: value,
    start: textareaElement()?.selectionStart ?? value.length,
    end: textareaElement()?.selectionEnd ?? value.length,
  };
}

/** Applies a transform unless it would pass the limit; keeps the new selection and focus. */
async function apply(transform: (state: TextState) => TextState | null): Promise<boolean> {
  const next = transform(selection());
  if (!next) return false;
  if (next.text.length > maxLength) {
    notice = `Character limit reached (${maxLength.toLocaleString('en')}).`;
    return true;
  }
  value = next.text;
  onChange?.(next.text);
  await tick();
  textareaElement()?.focus();
  textareaElement()?.setSelectionRange(next.start, next.end);
  updateSuggestions();
  return true;
}

// ── @ / # suggestions and / slash menu ───────────────────────────────────
let match = $state<TriggerMatch | null>(null);
let slashMatch = $state<SlashMatch | null>(null);
let active = $state(0);
let anchor = $state({ top: 0, left: 0 });
const suggestions = $derived.by(() => {
  if (!match) return [];
  const source = match.trigger === '@' ? mentions : references;
  const query = match.query.toLowerCase();
  return source
    .filter(
      (item) =>
        item.value.toLowerCase().startsWith(query) || item.label.toLowerCase().includes(query)
    )
    .slice(0, 8);
});
const slashItems = $derived.by(() =>
  slashMatch ? filterSlashCommands(slashMatch.query, slashCommands).slice(0, 8) : []
);
const open = $derived(suggestions.length > 0);
const slashOpen = $derived(slashItems.length > 0 && slashMatch !== null);
const listId = `editor-${uid}-suggestions`;
const slashListId = `editor-${uid}-slash`;

function updateSuggestions() {
  // Only while writing: the preview tab has no caret.
  if (!textareaElement() || (layout === 'tabs' && tab !== 'write')) {
    match = null;
    slashMatch = null;
    return;
  }
  const state = selection();
  const nextSlash = slashAt(state);
  if (nextSlash) {
    if (nextSlash.start !== slashMatch?.start || nextSlash.query !== slashMatch?.query) active = 0;
    slashMatch = nextSlash;
    match = null;
    const input = textareaElement();
    if (input) {
      const at = caretCoordinates(input, nextSlash.start);
      anchor = { top: at.top + at.height, left: at.left };
    }
    return;
  }
  slashMatch = null;
  const next = triggerAt(state);
  if (next?.start !== match?.start || next?.query !== match?.query) active = 0;
  match = next;
  const input = textareaElement();
  if (next && input) {
    const at = caretCoordinates(input, next.start);
    anchor = { top: at.top + at.height, left: at.left };
  }
}

function handleValueChange(next: string) {
  value = next;
  notice = '';
  updateSuggestions();
  scheduleDraft();
}

async function choose(index: number) {
  const item = suggestions[index];
  const current = match;
  if (!item || !current) return;
  await apply((s) => applyCompletion(s, current, item.value));
  match = null;
}

async function chooseSlash(index: number) {
  const item = slashItems[index];
  const current = slashMatch;
  if (!item || !current) return;
  await apply((s) => item.apply(clearSlashQuery(s, current)));
  slashMatch = null;
}

// ── keys ─────────────────────────────────────────────────────────────────
async function onKeydown(event: KeyboardEvent) {
  if (slashOpen) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + slashItems.length) % slashItems.length;
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      await chooseSlash(active);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      slashMatch = null;
      return;
    }
  }
  if (open) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + suggestions.length) % suggestions.length;
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      await choose(active);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      // Keep the editor's container (a dialog, say) open: Escape only closes the list.
      event.stopPropagation();
      match = null;
      return;
    }
  }
  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (mod) {
    const tool = TOOLS.find(
      (t) =>
        t.shortcut &&
        t.shortcut.code === event.code &&
        !!t.shortcut.shift === event.shiftKey &&
        !!t.shortcut.alt === event.altKey
    );
    if (tool) {
      event.preventDefault();
      // mod+k means "link" here, not the app command palette.
      event.stopPropagation();
      await apply(tool.apply);
    }
    return;
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    if (await maybeContinueList()) event.preventDefault();
  }
}

async function maybeContinueList(): Promise<boolean> {
  const next = continueList(selection());
  if (!next) return false;
  await apply(() => next);
  return true;
}

// ── draft autosave ───────────────────────────────────────────────────────
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let lastSaved = value;
function scheduleDraft() {
  if (!onDraft) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(flushDraft, draftDelayMs);
}
function flushDraft() {
  clearTimeout(draftTimer);
  draftTimer = undefined;
  if (onDraft && value !== lastSaved) {
    lastSaved = value;
    onDraft(value);
  }
}
onDestroy(flushDraft);

const remaining = $derived(maxLength - value.length);
const nearLimit = $derived(remaining <= Math.max(20, Math.round(maxLength * 0.1)));

// ── toolbar roving focus ─────────────────────────────────────────────────
let focusIndex = $state(0);
function toolbarKey(event: KeyboardEvent, index: number) {
  if (
    event.key !== 'ArrowRight' &&
    event.key !== 'ArrowLeft' &&
    event.key !== 'Home' &&
    event.key !== 'End'
  )
    return;
  event.preventDefault();
  const last = TOOLS.length - 1;
  focusIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? last
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + TOOLS.length) % TOOLS.length;
  (event.currentTarget as HTMLElement).parentElement
    ?.querySelectorAll<HTMLButtonElement>('button')
    [focusIndex]?.focus();
}
</script>

<div class={cx('rounded-lg border border-border bg-surface', className)}>
  <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-2 py-1.5">
    {#if layout === 'tabs'}
      <div role="tablist" aria-label={`${label} mode`} class="flex gap-1">
        {#each [['write', 'Write'], ['preview', 'Preview']] as [id, text] (id)}
          <Button
            type="button"
            role="tab"
            id={`editor-${uid}-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`editor-${uid}-panel-${id}`}
            tabindex={tab === id ? 0 : -1}
            class={cx('rounded-md px-2.5 py-1 text-sm', tab === id ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted')}
            onclick={() => {
              tab = id as 'write' | 'preview';
              match = null;
            }}
          >{text}</Button>
        {/each}
      </div>
    {/if}
    <div role="toolbar" aria-label={`Formatting for ${label}`} aria-controls={`editor-${uid}-input`} class={cx('flex flex-wrap gap-0.5', layout === 'tabs' && tab === 'preview' && 'invisible')}>
      {#each TOOLS as tool, index (tool.id)}
        <Button
          type="button"
          aria-label={tool.label}
          title={tool.shortcut ? `${tool.label} (${shortcutKeys(tool.shortcut.hint, isMac).join(isMac ? '' : '+')})` : tool.label}
          aria-keyshortcuts={tool.shortcut ? shortcutLabel(tool.shortcut.hint, isMac).replace(/ /g, '+') : undefined}
          tabindex={index === focusIndex ? 0 : -1}
          {disabled}
          class="inline-flex size-8 min-h-touch min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 sm:min-h-0 sm:min-w-0"
          onclick={() => apply(tool.apply)}
          onkeydown={(event) => toolbarKey(event, index)}
        >
          <LucideIcon icon={tool.icon} class="size-4" />
        </Button>
      {/each}
    </div>
  </div>

  <div class={cx(layout === 'split' && 'grid md:grid-cols-2 md:divide-x md:divide-border')}>
    <div
      id={`editor-${uid}-panel-write`}
      role={layout === 'tabs' ? 'tabpanel' : undefined}
      aria-labelledby={layout === 'tabs' ? `editor-${uid}-tab-write` : undefined}
      class={cx('relative', layout === 'tabs' && tab !== 'write' && 'hidden')}
    >
      <Textarea
        bind:ref={textarea}
        bind:value
        id={`editor-${uid}-input`}
        aria-label={label}
        aria-autocomplete="list"
        aria-controls={slashOpen ? slashListId : open ? listId : undefined}
        aria-activedescendant={slashOpen
          ? `${slashListId}-${active}`
          : open
            ? `${listId}-${active}`
            : undefined}
        aria-describedby={`editor-${uid}-count`}
        aria-invalid={remaining < 0 || undefined}
        {placeholder}
        {rows}
        {disabled}
        maxlength={maxLength}
        class="block w-full resize-y bg-transparent px-3 py-2 font-mono text-sm outline-none placeholder:text-muted-foreground"
        onValueChange={handleValueChange}
        onclick={updateSuggestions}
        onkeyup={(event) => {
          if (event.key.startsWith('Arrow') && !open) updateSuggestions();
        }}
        onkeydown={onKeydown}
        onblur={() => {
          match = null;
          slashMatch = null;
          flushDraft();
        }}
      ></Textarea>
      {#if slashOpen && slashMatch}
        <ul
          id={slashListId}
          role="listbox"
          aria-label="Commands"
          class="absolute z-20 max-h-56 w-64 overflow-y-auto rounded-md border border-border bg-elevated p-1 text-sm shadow-float"
          style:top={`${anchor.top + 8}px`}
          style:left={`${Math.max(0, anchor.left)}px`}
        >
          {#each slashItems as item, index (item.id)}
            <li
              id={`${slashListId}-${index}`}
              role="option"
              aria-selected={index === active}
              class={cx(
                'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5',
                index === active && 'bg-muted'
              )}
              onmousedown={(event) => {
                event.preventDefault();
                void chooseSlash(index);
              }}
            >
              <span
                class="inline-flex min-w-8 justify-center rounded bg-muted px-1 font-mono text-xs text-muted-foreground"
               >{item.glyph}</span
              >
              <span class="font-medium">{item.label}</span>
            </li>
          {/each}
        </ul>
      {:else if open && match}
        <ul
          id={listId}
          role="listbox"
          aria-label={match.trigger === '@' ? 'People' : 'References'}
          class="absolute z-20 max-h-56 w-64 overflow-y-auto rounded-md border border-border bg-elevated p-1 text-sm shadow-float"
          style:top={`${anchor.top + 8}px`}
          style:left={`${Math.max(0, anchor.left)}px`}
        >
          {#each suggestions as item, index (item.id)}
            <li
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              class={cx('cursor-pointer rounded px-2 py-1.5', index === active && 'bg-muted')}
              onmousedown={(event) => {
                // Keep focus (and the caret) in the textarea.
                event.preventDefault();
                void choose(index);
              }}
            >
              <span class="font-medium">{match.trigger}{item.value}</span>
              {#if item.label !== item.value}<span class="ml-1 text-muted-foreground">{item.label}</span>{/if}
              {#if item.description}<span class="block truncate text-xs text-muted-foreground">{item.description}</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    <div
      id={`editor-${uid}-panel-preview`}
      role={layout === 'tabs' ? 'tabpanel' : undefined}
      aria-labelledby={layout === 'tabs' ? `editor-${uid}-tab-preview` : undefined}
      class={cx('px-3 py-2', layout === 'tabs' && tab !== 'preview' && 'hidden')}
    >
      {#if (layout === 'split' || tab === 'preview') && Preview}
        <Preview source={value} label={`${label} preview`} />
      {:else if layout === 'split' || tab === 'preview'}
        <p class="text-sm text-muted-foreground" role="status">Loading preview…</p>
      {/if}
    </div>
  </div>

  <div class="flex items-center justify-between gap-2 border-t border-border px-3 py-1 text-xs text-muted-foreground">
    <span>Markdown supported</span>
    <span id={`editor-${uid}-count`} class={cx(nearLimit && 'text-foreground', remaining < 0 && 'text-destructive')}>
      {value.length.toLocaleString('en')} / {maxLength.toLocaleString('en')}
    </span>
  </div>
  <p class="sr-only" aria-live="polite">
    {#if notice}{notice}{:else if open}{suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'}, use the arrow keys and Enter.{:else if nearLimit}{Math.max(0, remaining)} characters left.{/if}
  </p>
</div>
