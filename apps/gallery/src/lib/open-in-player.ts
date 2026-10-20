import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import {
  blueprintShareFragment,
  encodeBlueprintShare,
  loadUntrustedBlueprint,
  MAX_SHARE_DECODED_BYTES,
  ShareLinkTooLargeError,
} from '@protoyard/blueprint';
import { withBase } from './format.ts';

interface PlayerEntrySource {
  kind: string;
  path: string;
}

/** Creates a hosted player URL from validated data, or returns null if it cannot fit. */
export async function openInPlayerUrl(
  input: unknown,
  playerPath = withBase('/play/')
): Promise<string | null> {
  const loaded = loadUntrustedBlueprint(input);
  if (!loaded.success) return null;
  try {
    const encoded = await encodeBlueprintShare(loaded.blueprint);
    return `${playerPath}${blueprintShareFragment(encoded)}`;
  } catch (error) {
    if (error instanceof ShareLinkTooLargeError) return null;
    throw error;
  }
}

/** Builds the link at Astro's static-build phase from a catalog entry's data file. */
export async function openInPlayerUrlForEntry(
  entry: PlayerEntrySource,
  workspaceRoot = process.env.PROTOYARD_REGISTRY
    ? dirname(dirname(resolve(process.env.PROTOYARD_REGISTRY)))
    : resolve(process.cwd(), '../..')
): Promise<string | null> {
  if (entry.kind !== 'prototype' && entry.kind !== 'blueprint') return null;
  if (!entry.path || isAbsolute(entry.path) || entry.path.split(/[\\/]/).includes('..'))
    return null;

  const root = realpathSync(workspaceRoot);
  const relativeFile = entry.kind === 'prototype' ? `${entry.path}/blueprint.json` : entry.path;
  const file = resolve(root, relativeFile);
  try {
    if (lstatSync(file).isSymbolicLink()) return null;
    const actual = realpathSync(file);
    const withinRoot = relative(root, actual);
    if (withinRoot === '..' || withinRoot.startsWith(`..${sep}`) || isAbsolute(withinRoot))
      return null;
    if (!statSync(actual).isFile() || statSync(actual).size > MAX_SHARE_DECODED_BYTES) return null;
    const blueprint = JSON.parse(readFileSync(actual, 'utf8')) as unknown;
    return openInPlayerUrl(blueprint);
  } catch {
    return null;
  }
}
