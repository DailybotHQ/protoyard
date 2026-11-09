import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { CommandResult, Handler } from '../lib/command.ts';
import { opt } from '../lib/command.ts';
import {
  COMPONENTS_FILE,
  isDesignSystemId,
  locateDesignSystem,
  readComponents,
  readDocumentFile,
  sha256File,
} from '../lib/design-systems.ts';
import { readLibrary } from '../lib/ds-catalog.ts';
import {
  approvedLibraryEntry,
  type ComponentRequest,
  checkComponentName,
  checkText,
  componentFolder,
  componentPath,
  componentSource,
  componentStory,
  documentLibraryEntry,
  draftEntry,
  libraryEntry,
  MAX_PERSON,
  MAX_PURPOSE,
  MAX_WHY,
  readRequest,
  requestPath,
  storyPath,
  writeDocumentLibraryEntry,
  writeJson,
  writeLibraryEntry,
} from '../lib/ds-components.ts';
import { CliError } from '../lib/output.ts';
import { canonicalPath, isInside } from '../lib/paths.ts';
import { resolveTarget } from '../lib/workspace.ts';
import { readDesignSystemBinding } from './check.ts';

/**
 * `protoyard ds component request | approve-request | new | approve`: how a
 * design system gets a new component of its own (PLAN_013 T-component).
 *
 * 1. `request <id> <Name> --purpose --why [--by]` records who wants which
 *    component and why the existing ones do not fit. It writes no code.
 * 2. `approve-request <id> <Name> --by` is run by a human. It is a record,
 *    not a proof: the CLI cannot tell who ran it; the reviewed commit is the
 *    guarantee.
 * 3. `new <id> <Name>` needs an approved request. It scaffolds
 *    `components/<Name>.svelte` from Texuli components (it passes the
 *    `check ds` rules), lists it in `components.json` as a draft with its
 *    sha256 and in the document's `library` (composes = the catalog ids it
 *    renders), and writes a kit story stub. It refuses to run from inside a
 *    prototype folder or for a locked `--prototype` target: an agent working
 *    in a locked prototype stops and asks instead.
 * 4. `approve <id> <Name> --by` is run by a human after review: the entry's
 *    sha256 is taken from the file as it is, and both the `components.json`
 *    entry and the document's `library` entry become approved (the library
 *    entry with its own `approval` and Texuli's entry hash). A record, not a
 *    proof; no MCP tool runs it.
 */

const MANIFEST = 'protoyard.json';

function ids(args: string[]): { id: string; name: string } {
  const id = args[0];
  if (!id) throw new CliError('usage', 'Missing <id>.');
  if (!isDesignSystemId(id)) {
    throw new CliError('usage', `"${id}" is not a design-system id (lowercase kebab-case).`);
  }
  return { id, name: checkComponentName(args[1]) };
}

function folderOf(root: string, id: string) {
  const location = locateDesignSystem(root, id);
  componentFolder(location);
  return location;
}

const rel = (id: string, sub: string, file: string) => `design-systems/${id}/${sub}/${file}`;

function refuseExistingComponent(location: ReturnType<typeof folderOf>, name: string): void {
  if (libraryEntry(location, name) || existsSync(componentPath(location, name))) {
    throw new CliError(
      'conflict',
      `Design system "${location.id}" already has a component "${name}".`,
      { hint: `Use it: import ${name} from '@ds/${location.id}/${name}';` }
    );
  }
}

/** The ISO time a CLI record is written (the real clock: not scenario data). */
const now = () => new Date().toISOString();

export const dsComponentRequestCommand: Handler = async (
  ctx,
  args,
  options
): Promise<CommandResult> => {
  const { id, name } = ids(args);
  const purpose = checkText(opt(options, 'purpose'), '--purpose', MAX_PURPOSE);
  const why = checkText(opt(options, 'why'), '--why', MAX_WHY);
  const by = opt(options, 'by');
  const requestedBy = by === undefined ? undefined : checkText(by, '--by', MAX_PERSON);
  const location = folderOf(ctx.root, id);
  refuseExistingComponent(location, name);
  const existing = readRequest(location, name);
  if (existing) {
    throw new CliError(
      'conflict',
      existing.status === 'open'
        ? `An open request for "${name}" already exists in design system "${id}".`
        : `The request for "${name}" in design system "${id}" is already approved.`,
      {
        hint:
          existing.status === 'open'
            ? `A human reviews it and runs \`protoyard ds component approve-request ${id} ${name} --by <name>\`.`
            : `Scaffold it: protoyard ds component new ${id} ${name}`,
      }
    );
  }
  const request: ComponentRequest = {
    format: 'protoyard/ds-component-request',
    version: 1,
    name,
    purpose,
    why,
    ...(requestedBy ? { requestedBy } : {}),
    requestedAt: now(),
    status: 'open',
  };
  writeJson(requestPath(location, name), request);
  const file = rel(id, 'requests', `${name}.json`);
  const data = {
    id,
    name,
    file,
    request,
    next: [`protoyard ds component approve-request ${id} ${name} --by "<reviewer>"`],
  };
  return {
    data,
    render(o) {
      o.always(`Recorded the request for ${name} in ${file} (status open). No code was written.`);
      o.always(
        `Next: a human reviews it and runs \`protoyard ds component approve-request ${id} ${name} --by "<reviewer>"\`.`
      );
    },
  };
};

export const dsComponentApproveRequestCommand: Handler = async (
  ctx,
  args,
  options
): Promise<CommandResult> => {
  const { id, name } = ids(args);
  const approvedBy = checkText(opt(options, 'by'), '--by', MAX_PERSON);
  const location = folderOf(ctx.root, id);
  const request = readRequest(location, name);
  if (!request) {
    throw new CliError('not_found', `No request for "${name}" in design system "${id}".`, {
      hint: `Record one first: protoyard ds component request ${id} ${name} --purpose "<text>" --why "<text>"`,
    });
  }
  if (request.status === 'approved') {
    throw new CliError('conflict', `The request for "${name}" is already approved.`, {
      hint: `Scaffold it: protoyard ds component new ${id} ${name}`,
    });
  }
  const approved: ComponentRequest = {
    ...request,
    status: 'approved',
    approvedBy,
    approvedAt: now(),
  };
  writeJson(requestPath(location, name), approved);
  const file = rel(id, 'requests', `${name}.json`);
  const data = {
    id,
    name,
    file,
    request: approved,
    next: [`protoyard ds component new ${id} ${name}`],
  };
  return {
    data,
    render(o) {
      o.always(`Approved the request for ${name} (${file}) as ${approvedBy}.`);
      o.always('  The CLI cannot prove who ran this; the reviewed commit is the guarantee.');
      o.always(`Next: protoyard ds component new ${id} ${name}`);
    },
  };
};

/** The prototype folder the working directory is in (a folder with protoyard.json), or null. */
function prototypeAround(root: string, cwd: string): string | null {
  if (!isInside(root, cwd)) return null;
  const top = canonicalPath(root);
  let current = canonicalPath(cwd);
  while (current !== top && isInside(top, current)) {
    if (existsSync(join(current, MANIFEST))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return typeof value === 'string' ? [value] : [];
}

export const dsComponentNewCommand: Handler = async (
  ctx,
  args,
  options
): Promise<CommandResult> => {
  const { id, name } = ids(args);
  const cwd = resolve(opt(options, 'cwd') ?? process.cwd());
  const around = prototypeAround(ctx.root, cwd);
  if (around) {
    throw new CliError(
      'usage',
      'Refusing to create a design-system component from inside a prototype folder.',
      {
        hint: 'Components belong to the design system, not to one prototype. Run it from the workspace root after the request is approved.',
      }
    );
  }
  for (const slug of list(options.prototype)) {
    const { entry, dir } = await resolveTarget(ctx, slug, 'prototype');
    const binding = readDesignSystemBinding(dir);
    if (binding?.locked) {
      throw new CliError(
        'usage',
        `${entry.slug} is locked to design system "${binding.id}"; components are not created for a locked prototype.`,
        {
          hint: 'Stop and ask the human: name, purpose and why the existing components do not fit. They request, approve and create it in the design system.',
        }
      );
    }
  }
  const location = folderOf(ctx.root, id);
  refuseExistingComponent(location, name);
  const request = readRequest(location, name);
  if (request?.status !== 'approved') {
    throw new CliError(
      'validation',
      request
        ? `The request for "${name}" in design system "${id}" is not approved yet.`
        : `No approved request for "${name}" in design system "${id}".`,
      {
        hint: request
          ? `A human approves it: protoyard ds component approve-request ${id} ${name} --by "<reviewer>"`
          : `First \`protoyard ds component request ${id} ${name} --purpose "<text>" --why "<text>"\`, then a human runs \`protoyard ds component approve-request ${id} ${name} --by "<reviewer>"\`.`,
      }
    );
  }
  // components.json must be readable before anything is written.
  readComponents(location);
  const component = componentPath(location, name);
  const story = storyPath(location, name);
  if (existsSync(story)) {
    throw new CliError('conflict', `${rel(id, 'stories', `${name}.json`)} already exists.`);
  }
  writeJson(story, componentStory(name));
  const source = componentSource(name, id);
  mkdirSync(dirname(component), { recursive: true });
  writeFileSync(component, source, 'utf8');
  const entry = draftEntry(name, request.purpose, component);
  const manifest = writeLibraryEntry(location, entry);
  const documentEntry = documentLibraryEntry(entry, source);
  const library = writeDocumentLibraryEntry(location, documentEntry);
  const files = [
    rel(id, 'components', `${name}.svelte`),
    `design-systems/${id}/${COMPONENTS_FILE}`,
    ...(library.written ? [location.file] : []),
    rel(id, 'stories', `${name}.json`),
  ];
  const data = {
    id,
    name,
    entry,
    files,
    import: `import ${name} from '@ds/${id}/${name}';`,
    components: manifest.components.length,
    library: library.written
      ? { id: documentEntry.id, composes: documentEntry.composes }
      : { skipped: library.reason },
    next: [`protoyard ds validate ${id}`],
  };
  return {
    data,
    render(o) {
      o.always(
        `Created ${name} in design system ${id} (draft ${entry.version}): ${files.join(', ')}`
      );
      o.always(`  ${data.import}`);
      o.always(`Next: edit it with Texuli components and layout classes, then ${data.next[0]}.`);
    },
  };
};

export const dsComponentApproveCommand: Handler = async (
  ctx,
  args,
  options
): Promise<CommandResult> => {
  const { id, name } = ids(args);
  const approvedBy = checkText(opt(options, 'by'), '--by', MAX_PERSON);
  const location = folderOf(ctx.root, id);
  const current = libraryEntry(location, name);
  if (!current) {
    throw new CliError('not_found', `Design system "${id}" has no component "${name}".`, {
      hint: `Scaffold it first: protoyard ds component new ${id} ${name}`,
    });
  }
  const file = componentPath(location, name);
  if (!existsSync(file) || lstatSync(file).isSymbolicLink()) {
    throw new CliError('not_found', `${rel(id, 'components', `${name}.svelte`)} is missing.`);
  }
  const approvedAt = now();
  const entry = {
    ...current,
    status: 'approved' as const,
    sha256: sha256File(file),
    approvedBy,
    approvedAt,
  };
  writeLibraryEntry(location, entry);
  const source = readFileSync(file, 'utf8');
  const existing = readLibrary(readDocumentFile(location)).find((e) => e.name === name);
  const documentEntry = approvedLibraryEntry(
    { ...documentLibraryEntry(entry, source), ...(existing ? { id: existing.id } : {}) },
    approvedBy,
    approvedAt
  );
  const library = writeDocumentLibraryEntry(location, documentEntry);
  const files = [
    `design-systems/${id}/${COMPONENTS_FILE}`,
    ...(library.written ? [location.file] : []),
  ];
  const data = {
    id,
    name,
    entry,
    library: library.written ? documentEntry : { skipped: library.reason },
    files,
    next: [`protoyard ds approve ${id} --by "<reviewer>"`],
  };
  return {
    data,
    render(o) {
      o.always(
        `Approved ${name} ${entry.version} in design system ${id} as ${approvedBy}: ${files.join(', ')}`
      );
      o.always('  The CLI cannot prove who ran this; the reviewed commit is the guarantee.');
      o.always(
        `  The library changed the document's content hash: approve the design system again (${data.next[0]}).`
      );
    },
  };
};
