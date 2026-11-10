import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { dsCheckInputs } from '../lib/ds-catalog.ts';
import type { ExtensionFile } from '../lib/ds-extensions/index.ts';
import { guardDsOutputFile, hasFormat } from '../lib/ds-output.ts';
import { CliError, mark } from '../lib/output.ts';
import { hasControlCharacter, toPosixRelative } from '../lib/paths.ts';

/** File name of one namespace's extension file: `protoyard.catalog-extension.json`. */
export function extensionFileName(namespace: string): string {
  return `${namespace || 'unnamed'}.catalog-extension.json`;
}

/**
 * `protoyard ds extensions [--out <dir>]`: Protoyard's catalog extensions
 * (`protoyard:<id>`, the `@protoyard/ui` components) as Texuli extension
 * files (`texuli/catalog-extension`), the same ones `ds validate` merges. Pass
 * them to `texuli ds check <document> --extensions <file>...` so Texuli's
 * check accepts the same allow keys as Protoyard's. Without `--out` the files
 * are printed (`--json`); with it they are written under design-systems/,
 * artifacts/ or tmp/ (another file there is replaced only with `--force`).
 */
export const dsExtensionsCommand: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  // Shaped by toExtensionFiles: `{ format, version, namespace, components }`.
  const extensions = dsCheckInputs().extensions as ExtensionFile['file'][];
  const out = opt(options, 'out');
  const files: { path: string; namespace: string; components: number }[] = [];
  if (out !== undefined) {
    if (hasControlCharacter(out) || out.trim() === '') {
      throw new CliError('unsafe_path', 'Unsafe --out path.');
    }
    // Every file is checked before the first write: design-systems/,
    // artifacts/ or tmp/ only, an extension file is replaced freely, any other
    // file only with --force.
    const targets = extensions.map((file) => ({
      file,
      target: guardDsOutputFile({
        root: ctx.root,
        requested: join(out, extensionFileName(file.namespace)),
        flag: '--out',
        force: flag(options, 'force'),
        kind: 'a catalog extension file',
        sameKind: hasFormat('texuli/catalog-extension'),
        existing: 'same-kind-or-force',
      }),
    }));
    for (const { file, target } of targets) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
      files.push({
        path: toPosixRelative(ctx.root, target),
        namespace: file.namespace,
        components: file.components.length,
      });
    }
  }
  const command =
    files.length > 0
      ? `npx texuli ds check design-systems/<id>/document.json --locked ${files.map((f) => `--extensions ${f.path}`).join(' ')}`
      : undefined;
  return {
    data: {
      count: extensions.length,
      ...(out !== undefined ? { files } : { extensions }),
      ...(command ? { texuliCheck: command } : {}),
    },
    render(o) {
      const { c } = o;
      if (out === undefined) {
        o.always(JSON.stringify(extensions, null, 2));
        return;
      }
      for (const file of files) {
        o.always(
          `${mark(c, 'pass')} ${c.bold(file.path)} (${file.components} components, namespace ${file.namespace})`
        );
      }
      if (command) o.always(`Check a document with Texuli the same way: ${c.cyan(command)}`);
    },
  };
};
