<script lang="ts">
import {
  ArrowUpRight,
  Check,
  Circle,
  Ellipsis,
  Heart,
  House,
  PenLine,
  Plus,
  Search,
  Settings,
  Square,
  Type,
} from '@lucide/svelte';
import { getRuntime, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { Badge, Button, Card, EmptyState, Input, Select, Separator, Textarea } from '@protoyard/ui';
import type { Component } from 'svelte';
import { Avatar } from 'texuli/avatar';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { Code, Kbd } from 'texuli/kbd-code';
import { MotionLoop } from 'texuli/motion/loop';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'texuli/table';
import { Box, Heading, Prose, Text } from 'texuli/typography';
import { ENTRIES, GROUPS } from './catalog/entries.ts';
import { demoLoader, demoProps } from './catalog/registry.ts';
import type { DesignKitDatabase, ReviewEntry } from './database/schema.ts';
import { reviewService } from './lib/services.ts';

const runtime = getRuntime<DesignKitDatabase>();
const principal = usePrincipal();
const personaId = $derived(principal.current?.persona.id ?? '');
const reviews = liveQuery(() => runtime.db.reviews.where('personaId').equals(personaId).toArray(), {
  initial: [] as ReviewEntry[],
  deps: () => personaId,
});

let section = $state('Foundations');
let foundation = $state('Color');
let search = $state('');
let selectedId = $state('button');
let Demo = $state<Component | undefined>();
let loadingDemo = $state(false);
let status = $state<ReviewEntry['status']>('todo');
let note = $state('');
let error = $state('');
let copied = $state(false);
let copying = $state(false);
let copyError = $state('');
// The sketches section carries the canvas editor, so it loads only when opened.
type SketchesModule = typeof import('./Sketches.svelte');
let sketchesModule = $state<Promise<SketchesModule> | null>(null);
function openSketches() {
  section = 'Sketches';
  sketchesModule ??= import('./Sketches.svelte');
}

const selected = $derived(
  ENTRIES.find((entry) => entry.id === selectedId) ?? {
    id: 'button',
    name: 'Button',
    group: 'Actions',
    summary: 'Primary, quiet and destructive actions.',
    demo: 'ButtonDemo',
  }
);
const review = $derived((reviews.current ?? []).find((row) => row.entryId === selectedId));
const filtered = $derived(
  ENTRIES.filter((entry) =>
    `${entry.name} ${entry.group} ${entry.summary}`
      .toLowerCase()
      .includes(search.toLowerCase().trim())
  )
);
const props = $derived(demoProps(selected.demo));

async function selectEntry(id: string) {
  const entry = ENTRIES.find((item) => item.id === id);
  if (!entry) return;
  selectedId = id;
  status = review?.status ?? 'todo';
  note = review?.note ?? '';
  loadingDemo = true;
  error = '';
  try {
    Demo = await demoLoader(entry.demo)();
  } finally {
    loadingDemo = false;
  }
}

/** Returns the save promise so `@protoyard/ui` Button can drive pending state. */
function saveReview(): Promise<unknown> {
  error = '';
  return reviewService()
    .save({ entryId: selectedId, status, note })
    .catch((cause: unknown) => {
      error = cause instanceof Error ? cause.message : 'Review could not be saved.';
      throw cause;
    });
}

async function copySnippet() {
  copying = true;
  copied = false;
  copyError = '';
  const examples: Record<string, string> = {
    button: '<button type="button" class="button button-primary">Save changes</button>',
    badge: '<span class="badge badge-success">Approved</span>',
    card: '<article class="card"><h2>Product health</h2><p>Activation is steady.</p></article>',
    field:
      '<label for="email">Work email</label>\n<input id="email" type="email" autocomplete="email" />',
  };
  try {
    await navigator.clipboard.writeText(examples[selectedId] ?? '');
    copied = true;
    window.setTimeout(() => {
      copied = false;
    }, 1600);
  } catch {
    copyError = 'Clipboard access is unavailable in this browser context.';
  } finally {
    copying = false;
  }
}

$effect(() => {
  if (!review) {
    status = 'todo';
    note = '';
  } else {
    status = review.status;
    note = review.note;
  }
});

void selectEntry('button');

const foundations = ['Color', 'Type', 'Shape', 'Motion', 'Icons', 'Brand', 'Adaptive'];
const colors = [
  { name: 'Canvas', value: '#f6f5f2' },
  { name: 'Ink', value: '#22252a' },
  { name: 'Accent', value: '#5b45d6' },
  { name: 'Success', value: '#247a55' },
  { name: 'Warning', value: '#a35c09' },
  { name: 'Surface', value: '#ffffff' },
];
function contrastInk(hex: string) {
  const rgb = hex
    .match(/[0-9a-f]{2}/gi)
    ?.slice(0, 3)
    .map((part) => Number.parseInt(part, 16) / 255) ?? [1, 1, 1];
  const linear = rgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * (linear[0] ?? 1) + 0.7152 * (linear[1] ?? 1) + 0.0722 * (linear[2] ?? 1) > 0.42
    ? '#22252a'
    : '#ffffff';
}

// Shape tokens are the design system's radius steps (Box `radius`), not literal pixels.
const shapes = [
  { name: 'Tight', radius: 'sm' },
  { name: 'Default', radius: 'lg' },
  { name: 'Soft', radius: 'xl' },
  { name: 'Pill', radius: 'full' },
] as const;
const icons = [
  { icon: House, label: 'Home' },
  { icon: Plus, label: 'Add' },
  { icon: Search, label: 'Search' },
  { icon: Heart, label: 'Favorite' },
  { icon: Check, label: 'Complete' },
  { icon: Ellipsis, label: 'More' },
  { icon: ArrowUpRight, label: 'External' },
  { icon: Settings, label: 'Settings' },
];
const STATUS_BADGE = { approved: 'success', 'in-progress': 'warning', todo: 'outline' } as const;
// The motion preview plays while the pointer or focus is on it, or after a click.
let motionHover = $state(false);
let motionPinned = $state(false);
</script>

<svelte:head><title>Studio Kit · Design system</title><meta name="description" content="Explore design foundations, component demos and review notes." /></svelte:head>

{#snippet eyebrowLabel(text: string, extra = '')}
  <Text as="span" size="xs" weight="semibold" tone="muted" tracking="wide" class={`block ${extra}`}>{text}</Text>
{/snippet}

{#snippet pageHeading(eyebrow: string, title: string, lede: string, pill: string)}
  <div class="mb-7 flex items-start justify-between gap-3">
    <div class="min-w-0">
      <Text size="xs" weight="semibold" tone="primary" tracking="wide">{eyebrow}</Text>
      <Heading level={1} size="xl" class="mt-1">{title}</Heading>
      <Text tone="muted" class="mt-2">{lede}</Text>
    </div>
    <Badge variant="outline" class="shrink-0">{pill}</Badge>
  </div>
{/snippet}

{#snippet sectionHead(title: string, hint: string)}
  <div class="min-w-0">
    <Text as="strong" size="sm" weight="semibold" class="block">{title}</Text>
    <Text as="small" size="xs" tone="muted" class="block">{hint}</Text>
  </div>
{/snippet}

<div class="min-h-screen md:flex">
  <Box as="aside" surface="default" radius="none" padding="none" class="flex flex-col px-4 py-3 md:sticky md:top-0 md:h-screen md:w-52 md:shrink-0 md:overflow-y-auto md:px-4 md:pt-6 md:pb-4 lg:w-60">
    <a href="#/" class="flex items-center gap-3 px-2 md:pb-7">
      <Avatar name="Studio Kit" initials="✳" tone="primary" shape="square" decorative />
      <span class="min-w-0">
        <Text as="strong" size="sm" weight="semibold" class="block">Studio Kit</Text>
        <Text as="small" size="xs" tone="muted" class="block">Design system</Text>
      </span>
    </a>
    <div class="hidden px-2.5 pb-2 md:block">{@render eyebrowLabel('LIBRARY')}</div>
    <div class="mt-3 flex flex-wrap gap-1 md:mt-0 md:flex-col md:flex-nowrap">
      <Button variant={section === 'Foundations' ? 'secondary' : 'ghost'} class="justify-start gap-2.5 md:w-full" onclick={() => section = 'Foundations'}><span aria-hidden="true">◈</span> Foundations</Button>
      <Button variant={section === 'Catalog' ? 'secondary' : 'ghost'} class="justify-start gap-2.5 md:w-full" onclick={() => section = 'Catalog'}><span aria-hidden="true">▦</span> Components <Text as="span" size="xs" tone="muted" class="ml-auto">{ENTRIES.length}</Text></Button>
      <Button variant={section === 'Sketches' ? 'secondary' : 'ghost'} class="justify-start gap-2.5 md:w-full" onclick={openSketches}><span aria-hidden="true">✎</span> Sketches</Button>
    </div>
    <div class="hidden px-2.5 pt-6 pb-2 md:block">{@render eyebrowLabel('FOUNDATIONS')}</div>
    <div class="hidden flex-col gap-0.5 md:flex">
      {#each foundations as item}
        <Button variant={foundation === item ? 'secondary' : 'ghost'} size="sm" class="w-full justify-start pl-9" onclick={() => { section = 'Foundations'; foundation = item; }}>{item}</Button>
      {/each}
    </div>
    <Box border="block-start" radius="none" padding="none" class="mt-auto hidden items-center gap-2.5 px-2 pt-3 md:flex">
      <Avatar name="Avery Chen" initials="AC" size="sm" status="online" decorative />
      <span class="min-w-0">
        <Text as="strong" size="xs" weight="semibold" class="block">Avery Chen</Text>
        <Text as="small" size="xs" tone="muted" class="block">Design owner</Text>
      </span>
    </Box>
  </Box>
  <Separator class="md:hidden" />
  <Separator orientation="vertical" class="hidden md:block md:self-stretch" />

  <main class="min-w-0 flex-1">
    <Box as="header" surface="default" border="block-end" radius="none" padding="none" class="flex h-12 items-center justify-between gap-3 px-4 md:h-16 md:px-9">
      <div class="flex min-w-0 items-center gap-2.5">
        <Text as="span" size="xs" tone="muted">Workspace</Text>
        <Text as="span" size="xs" tone="subtle" aria-hidden="true">/</Text>
        <Text as="strong" size="xs" weight="semibold" truncate>{section === 'Foundations' ? foundation : section === 'Sketches' ? 'Screen sketches' : 'Component catalog'}</Text>
      </div>
      <div class="flex items-center gap-4">
        <Badge variant="success">● Local preview</Badge>
        <Button variant="ghost" class="h-auto p-0" aria-label="Current persona AC"><Avatar name="Avery Chen" initials="AC" size="sm" decorative /></Button>
      </div>
    </Box>
    {#if section === 'Sketches'}
      {#await sketchesModule}
        <section class="dk-content"><Text as="span" size="sm" tone="muted">Loading sketches…</Text></section>
      {:then module}
        {#if module}<module.default />{/if}
      {:catch loadError}
        <section class="dk-content grid justify-items-start gap-3"><Text size="sm" tone="destructive" role="alert">The sketches could not be loaded: {loadError instanceof Error ? loadError.message : String(loadError)}</Text><Button onclick={() => { sketchesModule = import('./Sketches.svelte'); }}>Try again</Button></section>
      {/await}
    {:else if section === 'Foundations'}
      <section class="dk-content">
        {@render pageHeading(`FOUNDATION / ${foundation.toUpperCase()}`, `${foundation} foundations`, 'A practical starting point for a coherent, accessible product language.', 'v1.0 · Draft')}
        {#if foundation === 'Color'}
          <Box surface="default" border="default" radius="xl" padding="lg" class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              {@render eyebrowLabel('COLOR SYSTEM')}
              <Heading level={2} size="lg" class="mt-2">Clear meaning. Measured contrast.</Heading>
              <Text size="sm" tone="muted" class="mt-2 max-w-xl">Each swatch includes an automatically selected ink color for legible labels. Use semantic roles before adding new hues.</Text>
            </div>
            <Box surface="muted" radius="lg" padding="sm" class="flex shrink-0 items-center gap-3">
              <Text as="span" size="figure" weight="semibold" tone="primary">AA</Text>
              <Text as="small" size="xs" tone="muted">Contrast-aware<br />foreground pairing</Text>
            </Box>
          </Box>
          <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {#each colors as color}
              <Card class="overflow-hidden p-0">
                <!-- The swatch fill and its ink come from the palette data, through the icon's color props. -->
                <div class="relative h-24">
                  <Icon icon={Square} color={color.value} fill={color.value} preserveAspectRatio="none" class="absolute inset-0 size-full" aria-hidden="true" />
                  <span class="absolute inset-0 grid place-items-center">
                    <Icon icon={Type} color={contrastInk(color.value)} size="lg" label={`${color.name} ink sample`} />
                  </span>
                </div>
                <div class="px-3 pb-3">
                  <Text as="strong" size="sm" weight="semibold" class="block">{color.name}</Text>
                  <Text as="small" size="xs" tone="muted" mono class="block">{color.value.toUpperCase()}</Text>
                </div>
              </Card>
            {/each}
          </div>
          <Box as="section" surface="muted" radius="lg" padding="md" class="mt-6 flex items-start gap-3">
            <LucideIcon icon={Check} tone="success" class="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <Text as="strong" size="sm" weight="semibold" class="block">Contrast is part of the token</Text>
              <Text size="sm" tone="muted" class="mt-1">Always pair text with the ink shown on each color. Check real text sizes and states when you replace a palette.</Text>
            </div>
          </Box>
        {:else if foundation === 'Type'}
          <Box as="section" surface="default" border="default" radius="xl" padding="lg">
            {@render eyebrowLabel('TYPE SCALE · THEME FONT')}
            {#each [{ name: 'Display', token: 'Heading display' }, { name: 'Heading', token: 'Heading lg' }, { name: 'Body', token: 'Text md' }, { name: 'Caption', token: 'Text xs' }] as row, index}
              <Box border={index === 0 ? 'none' : 'block-start'} radius="none" padding="none" class="dk-type-row py-4">
                <Text as="span" size="xs" tone="muted">{row.name}</Text>
                {#if row.name === 'Display'}
                  <Heading level={2} size="display">Make space<br />for good ideas.</Heading>
                {:else if row.name === 'Heading'}
                  <Heading level={2} size="lg">Thoughtful interfaces</Heading>
                {:else if row.name === 'Body'}
                  <Text>Good typography makes information easier to scan and actions easier to understand.</Text>
                {:else}
                  <Text size="xs">Updated just now · visible to your team</Text>
                {/if}
                <Code class="dk-type-token">{row.token}</Code>
              </Box>
            {/each}
          </Box>
        {:else if foundation === 'Shape'}
          <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
            {#each shapes as shape}
              <Card class="grid justify-items-start gap-2 p-4">
                <Box surface="muted" border="strong" radius={shape.radius} padding="none" class="h-16 w-full" aria-hidden="true"></Box>
                <Text as="strong" size="sm" weight="semibold">{shape.name}</Text>
                <Code>radius="{shape.radius}"</Code>
              </Card>
            {/each}
          </div>
        {:else if foundation === 'Motion'}
          <Box as="section" surface="default" border="default" radius="xl" padding="lg" class="max-w-2xl">
            {@render eyebrowLabel('MOTION PRINCIPLES')}
            <Heading level={2} size="lg" class="mt-2">Small cues, calm pace.</Heading>
            <Text size="sm" tone="muted" class="mt-2">Use motion to clarify a state change. Respect the operating system's reduced-motion preference.</Text>
            <Box surface="muted" radius="lg" padding="sm" class="my-4">
              <Button
                variant="ghost"
                class="h-auto w-full justify-start gap-3 py-3"
                aria-pressed={motionPinned}
                onpointerenter={() => (motionHover = true)}
                onpointerleave={() => (motionHover = false)}
                onfocus={() => (motionHover = true)}
                onblur={() => (motionHover = false)}
                onclick={() => (motionPinned = !motionPinned)}
              >
                <MotionLoop preset="pulse" playing={motionHover || motionPinned} class="flex gap-1.5" aria-hidden="true">
                  <LucideIcon icon={Circle} tone="primary" fill="currentColor" />
                  <LucideIcon icon={Circle} tone="primary" fill="currentColor" />
                  <LucideIcon icon={Circle} tone="primary" fill="currentColor" />
                </MotionLoop>
                <Text as="span" size="xs" tone="muted">Hover or focus to preview</Text>
              </Button>
            </Box>
            <Prose>
              <ul>
                <li>Fast feedback: 120–180 ms</li>
                <li>Natural movement: ease-out</li>
                <li>Reduced motion: remove transforms and loops</li>
              </ul>
            </Prose>
          </Box>
        {:else if foundation === 'Icons'}
          <div class="grid grid-cols-4 gap-3">
            {#each icons as item}
              <Card class="grid justify-items-center gap-2 p-4">
                <LucideIcon icon={item.icon} size="lg" strokeWidth={1.75} aria-hidden="true" />
                <Text as="small" size="xs" tone="muted">{item.label}</Text>
              </Card>
            {/each}
          </div>
          <Text size="sm" tone="muted" class="mt-4">Prefer a consistent 1.75 px stroke icon set. Decorative icons are hidden from assistive technology; icon-only actions need a visible or accessible label.</Text>
        {:else if foundation === 'Brand'}
          <Box as="section" surface="default" border="default" radius="xl" padding="lg" class="flex max-w-3xl flex-col items-start gap-7 sm:flex-row sm:items-center">
            <Avatar name="Studio North" initials="✳" tone="primary" size="lg" decorative class="shrink-0" />
            <div class="min-w-0">
              {@render eyebrowLabel('BRAND MARK')}
              <Heading level={2} size="lg" class="mt-2">Studio North</Heading>
              <Text size="sm" tone="muted" class="mt-2">A flexible identity built from a simple mark, a confident violet accent and generous whitespace.</Text>
              <div class="mt-4 flex flex-wrap gap-2"><Badge variant="secondary">Clear</Badge><Badge variant="secondary">Considered</Badge><Badge variant="secondary">Useful</Badge></div>
            </div>
          </Box>
        {:else}
          <Box as="section" surface="default" border="default" radius="xl" padding="lg" class="flex flex-col items-start gap-8 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              {@render eyebrowLabel('RESPONSIVE BEHAVIOR')}
              <Heading level={2} size="lg" class="mt-2">One system, every screen.</Heading>
              <Text size="sm" tone="muted" class="mt-2 max-w-md">Layouts can reflow from a two-column desktop canvas to a single phone column without losing hierarchy.</Text>
            </div>
            <div class="flex items-end gap-4 self-center" aria-hidden="true">
              <Box border="strong" radius="lg" padding="none" class="grid w-44 gap-1.5 p-2">
                <Box surface="muted" radius="sm" padding="none" class="h-3"></Box>
                <div class="grid grid-cols-3 gap-1.5"><Box surface="muted" radius="sm" padding="none" class="h-12"></Box><Box surface="muted" radius="sm" padding="none" class="h-12"></Box><Box surface="muted" radius="sm" padding="none" class="h-12"></Box></div>
              </Box>
              <Box border="strong" radius="xl" padding="none" class="grid w-16 gap-1.5 p-1.5">
                <Box surface="muted" radius="sm" padding="none" class="h-2"></Box>
                <Box surface="muted" radius="sm" padding="none" class="h-8"></Box>
                <Box surface="muted" radius="sm" padding="none" class="h-8"></Box>
              </Box>
            </div>
          </Box>
        {/if}
      </section>
    {:else}
      <section class="dk-content">
        {@render pageHeading('LIBRARY / COMPONENTS', 'Component catalog', 'Explore patterns, copy usage and leave a review for each entry.', `${ENTRIES.length} entries`)}
        <Text as="label" class="mb-6 flex max-w-lg items-center gap-2"><LucideIcon icon={Search} tone="neutral" class="shrink-0" aria-hidden="true" /><Input bind:value={search} placeholder="Search components and patterns" aria-label="Search components and patterns" class="flex-1" /><Kbd>⌘ K</Kbd></Text>
        <div class="dk-catalog-layout">
          <nav class="flex gap-1 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0" aria-label="Component groups">
            <span class="hidden px-3 pb-1 md:block">{@render eyebrowLabel('GROUPS')}</span>
            {#each GROUPS as group}<Button variant={selected.group === group ? 'secondary' : 'ghost'} size="sm" class="gap-2 whitespace-nowrap md:w-full md:justify-between" onclick={() => { const first = ENTRIES.find((entry) => entry.group === group); if (first) return selectEntry(first.id); }}>{group}<Text as="span" size="xs" tone="muted">{ENTRIES.filter((entry) => entry.group === group).length}</Text></Button>{/each}
            <span class="hidden px-3 pt-4 pb-1 md:block">{@render eyebrowLabel('ENTRIES')}</span>
            {#each filtered as entry}<Button variant={selectedId === entry.id ? 'secondary' : 'ghost'} size="sm" class="hidden md:inline-flex md:w-full md:justify-start" onclick={() => selectEntry(entry.id)}>{entry.name}</Button>{/each}
          </nav>
          <div class="grid min-w-0 content-start gap-5">
            {#if filtered.length === 0}<EmptyState icon={Search} title="No matching components" description="Try a different name or group." />
            {:else}<div class="flex items-start justify-between gap-3"><div class="min-w-0"><Text size="xs" weight="semibold" tone="primary" tracking="wide">{selected.group.toUpperCase()} · COMPONENT</Text><Heading level={2} size="xl" class="mt-1">{selected.name}</Heading><Text tone="muted" class="mt-1">{selected.summary}</Text></div><Badge variant={STATUS_BADGE[review?.status ?? 'todo']} class="shrink-0">{review?.status ?? 'Not reviewed'}</Badge></div>
              <Box as="section" surface="default" border="default" radius="xl" padding="lg"><div class="mb-4 flex flex-wrap items-start justify-between gap-3">{@render sectionHead('Responsive preview', 'Same component, two common viewports')}<Button variant="outline" size="sm" onclick={copySnippet} disabled={copying}>{copying ? 'Copying…' : copied ? 'Copied' : 'Copy snippet ↗'}</Button></div>{#if copyError}<Text size="sm" tone="destructive" role="alert" class="mb-3">{copyError}</Text>{/if}
                <div class="dk-preview-grid"><Box as="article" border="default" radius="lg" padding="none" class="overflow-hidden"><Box surface="muted" border="block-end" radius="none" padding="none" class="flex items-center justify-between gap-2 px-3 py-2"><span class="flex gap-1" aria-hidden="true"><Box border="strong" radius="full" padding="none" class="size-2"></Box><Box border="strong" radius="full" padding="none" class="size-2"></Box><Box border="strong" radius="full" padding="none" class="size-2"></Box></span><Text as="small" size="xs" tone="muted">Desktop · 1280 px</Text><Text as="span" size="xs" tone="muted" aria-hidden="true">↗</Text></Box><div class="flex min-h-36 flex-wrap items-center justify-center gap-2 p-4">{#if loadingDemo}<Text as="span" size="sm" tone="muted">Loading preview…</Text>{:else if Demo}<Demo />{/if}</div></Box><Box as="article" border="default" radius="xl" padding="none" class="dk-phone-frame overflow-hidden"><Box surface="muted" border="block-end" radius="none" padding="none" class="flex flex-col items-center gap-1 px-3 py-2"><Box border="strong" radius="full" padding="none" class="h-1.5 w-10" aria-hidden="true"></Box><Text as="small" size="xs" tone="muted">Phone · 390 px</Text></Box><div class="flex min-h-56 flex-wrap content-center items-center justify-center gap-2 p-3">{#if loadingDemo}<Text as="span" size="sm" tone="muted">Loading…</Text>{:else if Demo}<Demo />{/if}</div></Box></div>
              </Box>
              <Box as="section" surface="default" border="default" radius="xl" padding="lg"><div class="mb-4 flex flex-wrap items-start justify-between gap-3">{@render sectionHead('Props', "Read from this demo's source annotations")}<Badge variant="outline">GENERATED</Badge></div>{#if props.length}<Table label={`${selected.name} properties`} density="compact" class="w-full"><TableHeader><TableRow><TableHead scope="col">Name</TableHead><TableHead scope="col">Type</TableHead><TableHead scope="col">Description</TableHead></TableRow></TableHeader><TableBody>{#each props as prop}<TableRow><TableCell><Code class="whitespace-nowrap">{prop.name}</Code></TableCell><TableCell><Code class="whitespace-nowrap">{prop.type}</Code></TableCell><TableCell><Text as="span" size="sm">{prop.description}</Text></TableCell></TableRow>{/each}</TableBody></Table>{:else}<Text size="sm" tone="muted">Add @prop annotations to the component source to document its API.</Text>{/if}</Box>
              <Box as="section" surface="default" border="default" radius="xl" padding="lg"><div class="mb-4 flex flex-wrap items-start justify-between gap-3">{@render sectionHead('Review notes', `Saved for ${principal.current?.persona.name ?? 'this persona'} in this browser`)}<Text as="span" size="xs" tone="muted">{review ? `Updated ${new Date(review.updatedAt).toLocaleDateString()}` : 'Not reviewed yet'}</Text></div><div class="dk-review-fields"><Text as="label" size="sm" weight="medium" class="grid gap-1.5">Status<Select bind:value={status} items={[{ value: 'todo', label: 'To do' }, { value: 'in-progress', label: 'In progress' }, { value: 'approved', label: 'Approved' }]} /></Text><Text as="label" size="sm" weight="medium" class="grid gap-1.5">Notes<Textarea bind:value={note} maxlength={500} placeholder="Add a decision, question or follow-up…"></Textarea><Text as="small" size="xs" tone="muted" class="justify-self-end">{note.length}/500</Text></Text><Button class="dk-save-button" loadingLabel="Saving review" onclick={() => saveReview()}>Save review</Button>{#if error}<Text size="sm" tone="destructive" role="alert" class="dk-review-error">{error}</Text>{/if}</div></Box>
            {/if}
          </div>
        </div>
      </section>
    {/if}
  </main>
</div>
