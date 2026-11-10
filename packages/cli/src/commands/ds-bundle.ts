import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { compileDesignSystemDocument } from '@protoyard/themes';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { DOCUMENT_FILE, isDesignSystemId, locateDesignSystem } from '../lib/design-systems.ts';
import {
  BUNDLE_FORMAT,
  type CheckedBundle,
  checkBundle,
  documentText,
  draftApproval,
  exportBundle,
  preflightImport,
  readBundleFile,
  writeImport,
} from '../lib/ds-bundle.ts';
import { readDocumentApproval } from '../lib/ds-catalog.ts';
import { formatFinding, validateFull } from '../lib/ds-full.ts';
import { guardDsOutputFile, hasFormat } from '../lib/ds-output.ts';
import { CliError } from '../lib/output.ts';
import { hasControlCharacter, toPosixRelative } from '../lib/paths.ts';

/**
 * `protoyard ds export <id> --bundle` and `protoyard ds import <file>`: a
 * design-system folder as one portable JSON bundle (`protoyard/ds-bundle`,
 * Texuli's `texuli/design-system-bundle` inside). See `lib/ds-bundle.ts` for
 * the format and every check an import runs before it writes.
 */

const IMPORTED_APPROVAL_NOTE =
  'An imported approval is a record from another workspace, not a proof. Review the import in a commit a designer approves (CODEOWNERS), or re-approve it here with `protoyard ds approve <id> --by <name>`.';

/** Import runs nothing, but component sources are code that later builds run. */
export const IMPORTED_CODE_NOTE =
  'Review this code before `protoyard ds kit`, `dev` or `build`: the import executed nothing, but these component sources are code that runs when the kit or a prototype using `@ds/<id>/<Name>` builds and is viewed. Treat them like a dependency from npm.';

/** Imported release records are records too. */
export const IMPORTED_RELEASES_NOTE =
  'Imported release records are records from another workspace, not a proof: each matches its document and the bundle history, but the bundle author wrote both.';

/** `ds export <id> --bundle [--out <file>] [--force]`. */
export async function dsExportBundle(
  root: string,
  ref: string,
  options: Record<string, unknown>
): Promise<CommandResult> {
  if (!isDesignSystemId(ref)) {
    throw new CliError('usage', `--bundle takes a design-system id, not "${ref}".`, {
      hint: 'A bundle packs a folder under design-systems/<id>/.',
    });
  }
  const location = locateDesignSystem(root, ref);
  const bundle = exportBundle(location);
  const outOption = opt(options, 'out');
  const sha256 = createHash('sha256').update(bundle.text).digest('hex');
  const data = {
    id: bundle.id,
    version: bundle.version,
    format: 'bundle' as const,
    contentHash: bundle.contentHash,
    sha256,
    bytes: Buffer.byteLength(bundle.text, 'utf8'),
    components: bundle.components,
    history: bundle.history,
    files: bundle.files,
    skipped: bundle.skipped,
    ...(outOption ? {} : { bundle: bundle.envelope }),
  };
  if (outOption) {
    // artifacts/, tmp/ or design-systems/ only, and --force replaces only a bundle.
    const out = guardDsOutputFile({
      root,
      requested: outOption,
      flag: '--out',
      force: flag(options, 'force'),
      kind: 'a design-system bundle',
      sameKind: hasFormat(BUNDLE_FORMAT),
    });
    const file = toPosixRelative(root, out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, bundle.text, 'utf8');
    return {
      data: { ...data, out: file },
      render(o) {
        o.always(
          `Wrote ${file}: design system ${bundle.id}@${bundle.version}, ${bundle.files.length} file(s), ${data.bytes} bytes, sha256 ${sha256}`
        );
        for (const path of bundle.skipped) o.always(`  skipped ${path} (not a design-system file)`);
        o.always(`Import it elsewhere with \`protoyard ds import ${file}\`.`);
      },
    };
  }
  return {
    data,
    render(o) {
      o.always(bundle.text.trimEnd());
    },
  };
}

function bundlePath(root: string, file: string): string {
  if (hasControlCharacter(file)) throw new CliError('unsafe_path', 'Unsafe bundle path.');
  return isAbsolute(file) ? file : resolve(root, file);
}

/** The files to write, after `--id` and `--draft` rewrote the document. */
function rewrite(
  checked: CheckedBundle,
  id: string,
  draft: boolean
): { files: CheckedBundle['files']; document: Record<string, unknown>; reset: boolean } {
  const renamed = id !== checked.id;
  if (renamed && checked.files.some((f) => f.path.startsWith('releases/'))) {
    throw new CliError(
      'usage',
      `Design system "${checked.id}" carries release records, which name it; it cannot be imported as "${id}".`,
      { hint: `Import it as "${checked.id}" (with --force to replace one), then copy it by hand.` }
    );
  }
  // The content hash covers the id, so a renamed document's approval no longer matches.
  const reset = (draft || renamed) && readDocumentApproval(checked.document) !== null;
  if (!renamed && !reset) return { files: checked.files, document: checked.document, reset };
  const document: Record<string, unknown> = { ...checked.document, id };
  if (reset) document.approval = draftApproval(String(document.version));
  const bytes = Buffer.from(documentText(document), 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return {
    files: checked.files.map((f) =>
      f.path === DOCUMENT_FILE ? { path: f.path, bytes, sha256 } : f
    ),
    document,
    reset,
  };
}

/** `ds import <file> [--id <id>] [--force] [--draft] [--dry-run]`. */
export const dsImportCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const file = args[0];
  if (!file) throw new CliError('usage', 'Missing <file>.');
  const read = readBundleFile(bundlePath(ctx.root, file));
  const checked = checkBundle(read.value);
  const idOption = opt(options, 'id');
  const id = idOption ?? checked.id;
  if (!isDesignSystemId(id)) {
    throw new CliError('usage', `"${id}" is not a design-system id (lowercase kebab-case).`);
  }
  const draft = flag(options, 'draft');
  const dryRun = flag(options, 'dryRun');
  const force = flag(options, 'force');
  const plan = rewrite(checked, id, draft);
  // Compiles as data (Texuli validates at trust "untrusted"); nothing runs.
  const compiled = await compileDesignSystemDocument(plan.document);
  if (!compiled.ok) {
    throw new CliError('validation', 'The bundled document does not compile.', {
      data: { errors: compiled.errors },
      hint: compiled.errors.slice(0, 3).join(' · '),
    });
  }
  const full = await validateFull(plan.document, `design-systems/${id}/${DOCUMENT_FILE}`);
  const exists = existsSync(resolve(ctx.root, 'design-systems', id));
  // The same refusals with and without --dry-run (flat <id>.json, symlinks, an existing folder).
  preflightImport(ctx.root, id, force);
  const written = dryRun ? null : writeImport(ctx.root, id, plan.files, force);
  const approval = readDocumentApproval(plan.document);
  const componentFiles = plan.files
    .filter((f) => f.path.startsWith('components/') && f.path.endsWith('.svelte'))
    .map((f) => ({ path: `design-systems/${id}/${f.path}`, bytes: f.bytes.length }));
  const releaseFiles = plan.files
    .filter((f) => f.path.startsWith('releases/'))
    .map((f) => `design-systems/${id}/${f.path}`);
  const data = {
    id,
    bundleId: checked.id,
    version: checked.version,
    contentHash: checked.contentHash,
    importedFrom: {
      file,
      sha256: read.sha256,
      designSystem: checked.id,
    },
    folder: `design-systems/${id}`,
    files: plan.files.map((f) => ({ path: f.path, sha256: f.sha256, bytes: f.bytes.length })),
    status: approval?.status ?? 'draft',
    ...(approval ? { approval } : {}),
    approvalReset: plan.reset,
    replaced: exists && !dryRun,
    dryRun,
    written: written !== null,
    full,
    note: IMPORTED_APPROVAL_NOTE,
    components: componentFiles,
    componentsNote: IMPORTED_CODE_NOTE.replace('<id>', id),
    releases: releaseFiles,
    releasesNote: IMPORTED_RELEASES_NOTE,
  };
  return {
    data,
    render(o) {
      o.always(
        `${dryRun ? 'Would import' : 'Imported'} ${checked.id}@${checked.version} into design-systems/${id}/ (${data.files.length} file(s))${data.replaced ? ', replacing the old folder' : ''}`
      );
      o.always(
        `  status ${data.status}${plan.reset ? ' (approval reset to draft)' : approval?.status === 'approved' ? ` (approved by ${approval.approvedBy ?? 'unknown'} in the source workspace)` : ''}`
      );
      o.always(
        `  full check: ${full.summary.errors} error(s), ${full.summary.warnings} warning(s), ${full.summary.info} info`
      );
      for (const finding of full.findings.slice(0, 10)) o.always(`    ${formatFinding(finding)}`);
      o.always(`  ${IMPORTED_APPROVAL_NOTE.replace('<id>', id)}`);
      if (componentFiles.length > 0) {
        o.always(`  ${componentFiles.length} component source(s), code to review:`);
        for (const c of componentFiles) o.always(`    ${c.path} (${c.bytes} bytes)`);
        o.always(`  ${data.componentsNote}`);
      }
      if (releaseFiles.length > 0) {
        o.always(`  ${releaseFiles.length} release record(s): ${releaseFiles.join(', ')}`);
        o.always(`  ${IMPORTED_RELEASES_NOTE}`);
      }
    },
  };
};
