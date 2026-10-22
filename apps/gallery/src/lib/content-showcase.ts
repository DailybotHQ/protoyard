import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  CONTENT_EXAMPLES,
  type ContentExample,
  contentExampleCover,
  contentExamplePath,
} from './content-examples.ts';
import { openInPlayerUrlForEntry } from './open-in-player.ts';

/**
 * The content examples resolved at static-build time: title and description
 * from each blueprint, its slide or section count, and a hosted-player share
 * link. Build-time only (reads the repository), like `openInPlayerUrlForEntry`.
 */

export interface ContentShowcaseCard {
  example: ContentExample;
  title: string;
  description: string;
  /** Slides for a deck, sections for a page, level-2 headings for a document. */
  parts: number;
  /** /play/ with the whole blueprint in the fragment, or null when it cannot fit. */
  playerHref: string | null;
  /** Site-relative cover path (pass it through withBase). */
  cover: string;
}

function workspaceRoot(): string {
  return process.env.PROTOYARD_REGISTRY
    ? dirname(dirname(resolve(process.env.PROTOYARD_REGISTRY)))
    : resolve(process.cwd(), '../..');
}

function countParts(blueprint: Record<string, unknown>, kind: ContentExample['kind']): number {
  const body = blueprint[kind] as Record<string, unknown> | undefined;
  if (kind === 'doc') {
    const blocks = Array.isArray(body?.blocks) ? (body.blocks as Record<string, unknown>[]) : [];
    return blocks.filter((block) => block.type === 'heading' && block.level === 2).length;
  }
  const list = kind === 'deck' ? body?.slides : body?.sections;
  return Array.isArray(list) ? list.length : 0;
}

export async function contentShowcaseCards(root = workspaceRoot()): Promise<ContentShowcaseCard[]> {
  return Promise.all(
    CONTENT_EXAMPLES.map(async (example) => {
      const path = contentExamplePath(example);
      const blueprint = JSON.parse(readFileSync(join(root, path), 'utf8')) as Record<
        string,
        unknown
      >;
      return {
        example,
        title: String(blueprint.name ?? example.name),
        description: String(blueprint.description ?? ''),
        parts: countParts(blueprint, example.kind),
        playerHref: await openInPlayerUrlForEntry({ kind: 'blueprint', path }, root),
        cover: contentExampleCover(example),
      };
    })
  );
}
