import { existsSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { libraryEntryContentHash } from '@texuli/spec/design-system';
import {
  COMPONENTS_DIR,
  COMPONENTS_FILE,
  type ComponentsManifest,
  type DesignSystemLocation,
  emptyComponentsManifest,
  type LibraryComponent,
  MAX_DOCUMENT_BYTES,
  readComponents,
  readDocumentFile,
  sha256File,
  writeDocumentFile,
} from './design-systems.ts';
import { composedCatalogIds, kebabCase, type LibraryEntryLike, readLibrary } from './ds-catalog.ts';
import {
  type ComponentRequest,
  ComponentRequestSchema,
  type ComponentStory,
} from './ds-contracts.ts';
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
 * `components.json` stays the source of the code hashes (the file and its
 * sha256). The document's `library` (Texuli spec 0.13.0) carries the same
 * components as entries `checkDesignSystemAllow` and `check ds` read: id
 * (kebab-case of the name), name, purpose, version, status and `composes`,
 * the catalog ids the component renders (`composedCatalogIds`). `ds component
 * new` and `ds component approve` keep both in step, through
 * `writeLibraryEntry` and `writeDocumentLibraryEntry`.
 *
 * An approved request is a record, not a proof: the CLI cannot tell who ran
 * `ds component approve-request`. The reviewed commit is the guarantee.
 */

export const REQUESTS_DIR = 'requests';
export const STORIES_DIR = 'stories';
export const INITIAL_COMPONENT_VERSION = '0.1.0';

const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]{0,63}$/;

export function isComponentName(value: string): boolean {
  return COMPONENT_NAME.test(value);
}

// The schemas live in ds-contracts.ts (one place for every design-system file).
export {
  type ComponentRequest,
  ComponentRequestSchema,
  type ComponentStory,
  ComponentStorySchema,
  MAX_PERSON,
  MAX_PURPOSE,
  MAX_WHY,
} from './ds-contracts.ts';

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

/** The document `library` entry of a component (composes = the catalog ids its source renders). */
export function documentLibraryEntry(
  component: Pick<LibraryComponent, 'name' | 'purpose' | 'version' | 'status'>,
  source: string
): LibraryEntryLike {
  return {
    id: kebabCase(component.name),
    name: component.name,
    purpose: component.purpose,
    version: component.version,
    status: component.status,
    composes: composedCatalogIds(source),
  };
}

/** The document with `entry` added to (or replacing its id in) `library`, sorted by id. */
export function withLibraryEntry(
  document: unknown,
  entry: LibraryEntryLike
): Record<string, unknown> {
  const base = (document ?? {}) as Record<string, unknown>;
  const library = [...readLibrary(base).filter((e) => e.id !== entry.id), entry].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  return { ...base, library };
}

/**
 * Writes one library entry into the document. A component that renders no
 * catalog component cannot be a library entry (`composes` needs one id): it
 * is skipped and the reason returned.
 */
export function writeDocumentLibraryEntry(
  location: DesignSystemLocation,
  entry: LibraryEntryLike
): { written: boolean; reason?: string } {
  if (entry.composes.length === 0) {
    return { written: false, reason: `${entry.name} renders no Texuli catalog component` };
  }
  writeDocumentFile(location, withLibraryEntry(readDocumentFile(location), entry));
  return { written: true };
}

/** Approves a document library entry: its own `approval` with Texuli's entry hash. */
export function approvedLibraryEntry(
  entry: LibraryEntryLike,
  approvedBy: string,
  approvedAt: string
): LibraryEntryLike {
  const { approval: _old, ...rest } = entry;
  const next: LibraryEntryLike = { ...rest, status: 'approved' };
  return {
    ...next,
    approval: {
      status: 'approved',
      version: next.version,
      approvedBy,
      approvedAt,
      contentHash: libraryEntryContentHash(structuredClone(next)),
    },
  };
}

/**
 * Adds a document `library` entry for every `components.json` component the
 * document lacks (`ds migrate`). Returns the new document and the added names.
 */
export function syncLibraryFromComponents(
  location: DesignSystemLocation,
  document: Record<string, unknown>,
  manifest: ComponentsManifest
): { document: Record<string, unknown>; added: string[] } {
  const listed = new Set(readLibrary(document).map((e) => e.name));
  let next = document;
  const added: string[] = [];
  for (const component of manifest.components) {
    if (listed.has(component.name) || !location.dir) continue;
    const file = join(location.dir, component.file);
    if (!existsSync(file) || lstatSync(file).isSymbolicLink()) continue;
    const entry = documentLibraryEntry(component, readFileSync(file, 'utf8'));
    if (entry.composes.length === 0) continue;
    next = withLibraryEntry(next, entry);
    added.push(component.name);
  }
  return { document: next, added };
}
