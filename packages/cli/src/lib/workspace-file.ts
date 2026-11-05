import { existsSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { CliError } from './output.ts';
import { hasControlCharacter, isInside } from './paths.ts';

/**
 * A path inside the workspace, resolved through every symlink (parents
 * included, as the other commands do with `canonicalPath`/`isInside`), never a
 * symlink itself, and free of control characters.
 */
export function workspaceFile(root: string, file: string): string {
  if (hasControlCharacter(file)) {
    throw new CliError('unsafe_path', 'The path contains a control character.');
  }
  const absolute = resolve(root, file);
  if (!isInside(root, absolute)) {
    throw new CliError('unsafe_path', `${file} is outside the workspace.`);
  }
  if (existsSync(absolute) && lstatSync(absolute).isSymbolicLink()) {
    throw new CliError('unsafe_path', `Refusing to use the symlink ${file}.`);
  }
  return absolute;
}
