import { existsSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import {
  COMPONENTS_DIR,
  COMPONENTS_FILE,
  type ComponentsManifest,
  type DesignSystemLocation,
  emptyComponentsManifest,
  type LibraryComponent,
  MAX_DOCUMENT_BYTES,
  readComponents,
  sha256File,
} from './design-systems.ts';
import { CliError } from './output.ts';
import { hasControlCharacter } from './paths.ts';

/**
 * A design system's own components (locked design systems, PLAN_013
 * T-component): the request → approve-request → new flow.
 *
 * ```text
 * design-systems/<id>/
 *   requests/<Name>.json   who asked for which component, and why (no code)
 *   components/<Name>.svelte
 *   components.json        the library entries (name, purpose, version, status, sha256)
 *   stories/<Name>.json    the kit's story stub for the component
 * ```
 *
 * `components.json` is the source of truth for the library until Texuli's
 * spec 0.13.0 moves the entries into the document; every read and write of
 * the entries goes through `readComponents` / `writeLibraryEntry` so that
 * move touches one place.
 *
 * An approved request is a record, not a proof: the CLI cannot tell who ran
 * `ds component approve-request`. The reviewed commit is the guarantee.
 */

export const REQUESTS_DIR = 'requests';
export const STORIES_DIR = 'stories';
export const MAX_PURPOSE = 280;
export const MAX_WHY = 1000;
export const MAX_PERSON = 120;
export const INITIAL_COMPONENT_VERSION = '0.1.0';

const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]{0,63}$/;

export function isComponentName(value: string): boolean {
  return COMPONENT_NAME.test(value);
}

/** One line of human text: no control characters, line or paragraph separators. */
const lineText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => !hasControlCharacter(value), 'Use one line without control characters.');

export const ComponentRequestSchema = z
  .object({
    format: z.literal('protoyard/ds-component-request'),
    version: z.literal(1),
    name: z.string().regex(COMPONENT_NAME),
    purpose: lineText(MAX_PURPOSE),
    /** Why the existing components do not fit. */
    why: lineText(MAX_WHY),
    requestedBy: lineText(MAX_PERSON).optional(),
    requestedAt: z.iso.datetime(),
    status: z.enum(['open', 'approved']),
    approvedBy: lineText(MAX_PERSON).optional(),
    approvedAt: z.iso.datetime().optional(),
  })
  .strict();
export type ComponentRequest = z.infer<typeof ComponentRequestSchema>;

export const ComponentStorySchema = z
  .object({
    format: z.literal('protoyard/ds-story'),
    version: z.literal(1),
    component: z.string().regex(COMPONENT_NAME),
    variants: z
      .array(
        z
          .object({
            name: z.string().min(1).max(80),
            props: z.record(z.string(), z.unknown()),
          })
          .strict()
      )
      .min(1)
      .max(50),
  })
  .strict();
export type ComponentStory = z.infer<typeof ComponentStorySchema>;

/** Checks one CLI text input; `label` names the flag in the error. */
export function checkText(value: string | undefined, label: string, max: number): string {
  if (value === undefined || value.trim() === '') {
    throw new CliError('usage', `Missing ${label}.`);
  }
  if (hasControlCharacter(value)) {
    throw new CliError('validation', `${label} contains a control character or a line break.`, {
      hint: 'Use one line of plain text.',
    });
  }
  if (value.length > max) {
    throw new CliError('validation', `${label} is longer than ${max} characters.`);
  }
  return value;
}

export function checkComponentName(name: string | undefined): string {
  if (!name) throw new CliError('usage', 'Missing <Name>.');
  if (!isComponentName(name)) {
    throw new CliError('usage', `"${name}" is not a component name (PascalCase, e.g. StatusPill).`);
  }
  return name;
}

/** The folder of a design system that can own components, or an error. */
export function componentFolder(location: DesignSystemLocation): string {
  if (location.layout !== 'folder' || !location.dir) {
    throw new CliError(
      'validation',
      `${location.file} is a flat document; only a design-system folder has components.`,
      { hint: `Run \`protoyard ds migrate ${location.id ?? '<id>'}\` first.` }
    );
  }
  return location.dir;
}

function refuseLink(path: string, label: string): void {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
    throw new CliError('unsafe_path', `Refusing to use the symlink ${label}.`);
  }
}

/** A path in the design-system folder; the folder, sub-folder and file must not be symlinks. */
function folderPath(location: DesignSystemLocation, sub: string, file: string): string {
  const dir = componentFolder(location);
  refuseLink(join(dir, sub), `design-systems/${location.id}/${sub}`);
  const path = join(dir, sub, file);
  refuseLink(path, `design-systems/${location.id}/${sub}/${file}`);
  return path;
}

export function requestPath(location: DesignSystemLocation, name: string): string {
  return folderPath(location, REQUESTS_DIR, `${name}.json`);
}

export function componentPath(location: DesignSystemLocation, name: string): string {
  return folderPath(location, COMPONENTS_DIR, `${name}.svelte`);
}

export function storyPath(location: DesignSystemLocation, name: string): string {
  return folderPath(location, STORIES_DIR, `${name}.json`);
}

export function readRequest(location: DesignSystemLocation, name: string): ComponentRequest | null {
  const path = requestPath(location, name);
  const label = `design-systems/${location.id}/${REQUESTS_DIR}/${name}.json`;
  if (!existsSync(path)) return null;
  if (statSync(path).size > MAX_DOCUMENT_BYTES) {
    throw new CliError('validation', `${label} is larger than 1 MiB.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new CliError('validation', `Could not read ${label}: ${(error as Error).message}`);
  }
  const parsed = ComponentRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CliError('validation', `${label} is not a valid component request.`, {
      hint: parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join(' · '),
    });
  }
  if (parsed.data.name !== name) {
    throw new CliError('validation', `${label} is for "${parsed.data.name}", not "${name}".`);
  }
  return parsed.data;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** The library entry for `name`, if `components.json` lists one. */
export function libraryEntry(
  location: DesignSystemLocation,
  name: string
): LibraryComponent | undefined {
  return readComponents(location)?.components.find((component) => component.name === name);
}

/** Adds (or replaces) one entry in `components.json`, sorted by name. */
export function writeLibraryEntry(
  location: DesignSystemLocation,
  entry: LibraryComponent
): ComponentsManifest {
  const dir = componentFolder(location);
  const file = join(dir, COMPONENTS_FILE);
  refuseLink(file, `design-systems/${location.id}/${COMPONENTS_FILE}`);
  const manifest = readComponents(location) ?? emptyComponentsManifest();
  const components = [...manifest.components.filter((c) => c.name !== entry.name), entry].sort(
    (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  );
  const next: ComponentsManifest = { ...manifest, components };
  writeJson(file, next);
  return next;
}

/**
 * The scaffold of a new component: Svelte 5 runes, typed props, composed of
 * Texuli components with layout utility classes only. No `<style>`, no inline
 * style, no visual classes, so `protoyard check ds` passes. The request's
 * free text never goes into the source (it lives in components.json).
 */
export function componentSource(name: string, designSystemId: string): string {
  return `<script lang="ts">
  // ${name}: a component of the design system "${designSystemId}" (protoyard ds component new).
  // Compose allowed Texuli components with layout utility classes only: no style block,
  // no inline style and no visual classes (\`protoyard check ds\` fails on them).
  // After editing, update its sha256 in components.json (\`protoyard ds validate ${designSystemId}\` reports drift).
  import { Badge, type BadgeVariant } from 'texuli/badge';
  import { Card, CardContent } from 'texuli/card';

  interface Props {
    /** The main text. */
    label: string;
    /** A short status shown as a badge. */
    status?: string;
    /** The badge's semantic variant. */
    variant?: BadgeVariant;
  }

  let { label, status, variant = 'neutral' }: Props = $props();
</script>

<Card>
  <CardContent>
    <div class="flex items-center justify-between gap-3">
      <span>{label}</span>
      {#if status}
        <Badge {variant} label={status} />
      {/if}
    </div>
  </CardContent>
</Card>
`;
}

/** The kit story stub for a scaffolded component. */
export function componentStory(name: string): ComponentStory {
  return {
    format: 'protoyard/ds-story',
    version: 1,
    component: name,
    variants: [{ name: 'Default', props: { label: name, status: 'Ready', variant: 'neutral' } }],
  };
}

/** The `components.json` entry for a freshly scaffolded file. */
export function draftEntry(name: string, purpose: string, file: string): LibraryComponent {
  return {
    name,
    purpose,
    version: INITIAL_COMPONENT_VERSION,
    status: 'draft',
    file: `${COMPONENTS_DIR}/${name}.svelte`,
    sha256: sha256File(file),
  };
}
