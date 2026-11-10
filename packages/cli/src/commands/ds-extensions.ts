import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CommandResult, Handler } from '../lib/command.ts';
import { opt } from '../lib/command.ts';
import { dsCheckInputs } from '../lib/ds-catalog.ts';
import type { ExtensionFile } from '../lib/ds-extensions/index.ts';
import { CliError, mark } from '../lib/output.ts';
import { isInside, toPosixRelative } from '../lib/paths.ts';

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
 * are printed (`--json`); with it they are written inside the workspace.
 */
export const dsExtensionsCommand: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  // Shaped by toExtensionFiles: `{ format, version, namespace, components }`.
  const extensions = dsCheckInputs().extensions as ExtensionFile['file'][];
  const out = opt(options, 'out');
  const files: { path: string; namespace: string; components: number }[] = [];
  if (out !== undefined) {
    const dir = resolve(ctx.root, out);
    if (!isInside(ctx.root, dir)) {
      throw new CliError('unsafe_path', `--out must be inside the workspace: ${out}`);
    }
    if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) {
      throw new CliError('unsafe_path', `Refusing to write through the symlink ${out}.`);
    }
    mkdirSync(dir, { recursive: true });
    for (const file of extensions) {
      const target = join(dir, extensionFileName(file.namespace));
      if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
        throw new CliError('unsafe_path', `Refusing to write through the symlink ${target}.`);
      }
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
