<script lang="ts">
import type { Theme, ThemeInput } from '@protoyard/core';
import { getTheme } from '@protoyard/themes';
import {
  compileDesignSystemDocument,
  createDesignSystem,
  type DesignSystem,
  type DesignSystemCompileResult,
  type DesignSystemInput,
  defineDesignSystemTheme,
  designSystemContrast,
  designSystemFromTheme,
} from '@protoyard/themes/texuli';
import { Input, Textarea } from 'texuli/input';
import { storeDesignSystem } from '../design-systems.ts';
import Btn from '../primitives/Btn.svelte';
import Section from '../primitives/Section.svelte';
import Segmented from '../primitives/Segmented.svelte';
import type { DevtoolsState } from '../state.svelte.ts';

/**
 * Design systems in Theme Studio: a complete Texuli design system from a
 * one-line brief and a few choices, from the current theme, or from pasted
 * design-system JSON. Texuli validates it as untrusted input and compiles it
 * (the compiler loads on first use); "Save and apply" saves its theme with the
 * custom themes, keeps the document for the next load, and paints it with
 * Texuli's runtime (`applyDesignSystem`).
 */

interface CustomThemeApi {
  saveCustom(input: ThemeInput): Promise<Theme>;
}

let { dt, api, onSaved }: { dt: DevtoolsState; api: CustomThemeApi; onSaved: () => void } =
  $props();

const runtime = $derived(dt.runtime);

type Shape = NonNullable<DesignSystemInput['shape']>;
type Density = NonNullable<DesignSystemInput['density']>;
type Motion = NonNullable<DesignSystemInput['motion']>;

let name = $state('My design system');
let brief = $state('');
let brand = $state('#0f766e');
let font = $state('Inter');
let headingFont = $state('');
let shape = $state<Shape>('rounded');
let density = $state<Density>('comfortable');
let motion = $state<Motion>('subtle');
let pasted = $state('');

let document = $state.raw<DesignSystem | null>(null);
let result = $state.raw<DesignSystemCompileResult | null>(null);
let notes = $state<string[]>([]);
let errors = $state<string[]>([]);

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const idFor = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(?![a-z])/, 'ds-')
    .slice(0, 48) || 'design-system';
const id = $derived(idFor(name));
const compiled = $derived(result?.ok ? result : null);
const contrast = $derived(compiled ? designSystemContrast(compiled.compiled) : {});
const busy = $derived(dt.isBusy('design-system'));

async function compileDocument(next: DesignSystem | unknown, extra: string[]): Promise<void> {
  const compiledResult = await compileDesignSystemDocument(next);
  result = compiledResult;
  document = compiledResult.ok ? (next as DesignSystem) : null;
  errors = compiledResult.ok ? [] : compiledResult.errors.slice(0, 6);
  notes = extra;
}

async function create(): Promise<void> {
  errors = [];
  if (!HEX.test(brand)) {
    errors = ['Use a hex brand color such as #0f766e.'];
    result = null;
    return;
  }
  const created = await createDesignSystem({
    id,
    name: name.trim().slice(0, 80) || id,
    ...(brief.trim() ? { brief: brief.trim() } : {}),
    brand,
    ...(font.trim() ? { font: font.trim() } : {}),
    ...(headingFont.trim() ? { headingFont: headingFont.trim() } : {}),
    shape,
    density,
    motion,
  });
  if (!created.ok) {
    errors = created.errors;
    result = null;
    return;
  }
  await compileDocument(created.document, created.warnings);
}

async function fromCurrentTheme(): Promise<void> {
  const state = runtime.theme.appearance();
  const theme = getTheme(state.theme.value, runtime.theme.themes());
  const imported = await designSystemFromTheme(theme, {
    id: idFor(`${theme.id}-ds`),
    name: `${theme.name} DS`.slice(0, 80),
  });
  name = imported.document.name;
  await compileDocument(
    imported.document,
    imported.losses.map((loss) => `${loss.path}: ${loss.reason}`)
  );
}

async function fromJson(): Promise<void> {
  let value: unknown;
  try {
    value = JSON.parse(pasted);
  } catch {
    errors = ['That is not JSON.'];
    result = null;
    return;
  }
  await compileDocument(value, []);
}

async function saveAndApply(): Promise<void> {
  if (!compiled || !document) return;
  const current = document;
  const { shipped, theme } = compiled;
  const saved = await dt.run(
    'design-system',
    async () => {
      const stored = await api.saveCustom(theme);
      storeDesignSystem(runtime.manifest.storage.namespace, current);
      defineDesignSystemTheme(shipped);
      await runtime.theme.setOverride({ themeId: stored.id });
      return stored;
    },
    `Applied the design system “${theme.name}”`
  );
  if (saved) onSaved();
}

const documentHref = $derived(
  document
    ? `data:application/json;charset=utf-8,${encodeURIComponent(`${JSON.stringify(document, null, 2)}\n`)}`
    : null
);

const inputClass =
  'min-h-touch w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:min-h-7';
</script>

<Section
  title="Design system"
  description="A complete Texuli design system: colors, type, shape, density and motion, compiled and checked for contrast."
>
  <div class="grid gap-2.5" data-testid="design-system-studio">
    <label class="grid gap-1 text-[11px] text-muted-foreground">
      Name
      <Input class={inputClass} bind:value={name} aria-label="Design system name" data-testid="ds-name" />
    </label>
    <p class="text-[11px] text-muted-foreground">Id <code class="font-mono">{id}</code></p>
    <label class="grid gap-1 text-[11px] text-muted-foreground">
      Brief (optional)
      <Input
        class={inputClass}
        bind:value={brief}
        placeholder="brand #4f46e5, font Inter, rounded, compact"
        aria-label="Design system brief"
        data-testid="ds-brief"
      />
    </label>
    <div class="grid grid-cols-2 gap-2">
      <label class="grid gap-1 text-[11px] text-muted-foreground">
        Brand color
        <Input class="{inputClass} font-mono" bind:value={brand} aria-label="Brand color (hex)" data-testid="ds-brand" spellcheck="false" />
      </label>
      <label class="grid gap-1 text-[11px] text-muted-foreground">
        Body font
        <Input class={inputClass} bind:value={font} aria-label="Body font" data-testid="ds-font" />
      </label>
    </div>
    <label class="grid gap-1 text-[11px] text-muted-foreground">
      Heading font (optional)
      <Input class={inputClass} bind:value={headingFont} aria-label="Heading font" />
    </label>
    <Segmented
      label="Shape"
      value={shape}
      options={[
        { value: 'sharp', label: 'Sharp' },
        { value: 'rounded', label: 'Rounded' },
        { value: 'pill', label: 'Pill' },
      ]}
      onchange={(value) => (shape = value)}
    />
    <Segmented
      label="Density"
      value={density}
      options={[
        { value: 'compact', label: 'Compact' },
        { value: 'comfortable', label: 'Comfortable' },
        { value: 'spacious', label: 'Spacious' },
      ]}
      onchange={(value) => (density = value)}
    />
    <Segmented
      label="Motion"
      value={motion}
      options={[
        { value: 'none', label: 'None' },
        { value: 'subtle', label: 'Subtle' },
        { value: 'standard', label: 'Standard' },
        { value: 'expressive', label: 'Expressive' },
      ]}
      onchange={(value) => (motion = value)}
    />
    <div class="flex flex-wrap gap-1.5">
      <Btn variant="primary" onclick={() => create()}>Create design system</Btn>
      <Btn onclick={() => fromCurrentTheme()}>From the current theme</Btn>
    </div>

    <label class="grid gap-1 text-[11px] text-muted-foreground">
      Or paste design-system JSON
      <Textarea class="{inputClass} h-16 font-mono" bind:value={pasted} aria-label="Design-system JSON" spellcheck="false"></Textarea>
    </label>
    <div><Btn onclick={() => fromJson()} disabled={!pasted.trim()}>Check JSON</Btn></div>

    {#if errors.length > 0}
      <ul class="grid gap-0.5 text-[11px] text-destructive" role="alert" data-testid="ds-errors">
        {#each errors as error (error)}<li>{error}</li>{/each}
      </ul>
    {/if}

    {#if compiled}
      <div class="grid gap-1.5 rounded-md border border-border p-2 text-xs" role="status" data-testid="ds-report">
        <p class="font-medium">
          {compiled.compiled.name}
          <span class="font-normal text-muted-foreground">· {compiled.compiled.id}@{compiled.compiled.version}</span>
        </p>
        <ul class="grid gap-0.5 text-[11px]">
          {#each Object.entries(contrast) as [mode, report] (mode)}
            <li class={report.passed === report.total ? 'text-success' : 'text-warning'}>
              {mode}: {report.passed}/{report.total} contrast pairs pass
            </li>
          {/each}
        </ul>
        <div class="flex flex-wrap gap-1" aria-label="Colors">
          {#each ['primary', 'secondary', 'accent', 'background', 'foreground'] as const as role (role)}
            <span class="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span class="size-3 rounded-full border border-border" style:background-color={compiled.theme.light[role]} aria-hidden="true"></span>{role}
            </span>
          {/each}
        </div>
        {#if notes.length > 0}
          <details class="text-[11px] text-muted-foreground">
            <summary>{notes.length} note{notes.length === 1 ? '' : 's'}</summary>
            <ul class="mt-1 grid gap-0.5">{#each notes as note (note)}<li>{note}</li>{/each}</ul>
          </details>
        {/if}
        <div class="flex flex-wrap items-center gap-1.5">
          <Btn variant="primary" busy={busy} onclick={() => saveAndApply()}>Save and apply</Btn>
          {#if documentHref}
            <a class="text-[11px] font-medium text-primary underline" href={documentHref} download={`${compiled.compiled.id}.json`}>Download {compiled.compiled.id}.json</a>
          {/if}
        </div>
        <p class="text-[11px] text-muted-foreground">
          In the repository: <code class="font-mono">pnpm protoyard ds use {runtime.manifest.slug} design-systems/{compiled.compiled.id}.json</code>
        </p>
      </div>
    {/if}
  </div>
</Section>
