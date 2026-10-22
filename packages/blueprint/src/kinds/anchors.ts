import { type Block, forEachBlock } from '@protoyard/blocks';
import type { z } from 'zod';

/*
 * Cross-checks shared by the page and doc bodies. Block shapes stay in
 * `@protoyard/blocks` and document shapes in `@protoyard/pages`; these only
 * look at ids and in-document links across a whole body.
 */

export type Path = (string | number)[];

/** Every block id in a list (containers included), with its path. */
export function blockIds(blocks: readonly Block[], base: Path): { id: string; path: Path }[] {
  const out: { id: string; path: Path }[] = [];
  forEachBlock(blocks, (block, path) => {
    const id = 'id' in block ? block.id : undefined;
    if (typeof id === 'string') out.push({ id, path: [...base, ...path, 'id'] });
  });
  return out;
}

/** Every `#fragment` link under `value`, by path. Nothing else is read. */
export function fragmentLinks(value: unknown, base: Path): { target: string; path: Path }[] {
  const out: { target: string; path: Path }[] = [];
  const stack: { value: unknown; path: Path }[] = [{ value, path: base }];
  while (stack.length > 0) {
    const { value: node, path } = stack.pop() as { value: unknown; path: Path };
    if (Array.isArray(node)) {
      for (const [i, item] of node.entries()) stack.push({ value: item, path: [...path, i] });
    } else if (node !== null && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        if (key === 'href' && typeof child === 'string' && child.startsWith('#')) {
          out.push({ target: child.slice(1), path: [...path, key] });
        } else {
          stack.push({ value: child, path: [...path, key] });
        }
      }
    }
  }
  return out.sort((a, b) => JSON.stringify(a.path).localeCompare(JSON.stringify(b.path)));
}

/** Reports every `#fragment` link whose target is not in `targets`. */
export function checkFragmentLinks(
  links: readonly { target: string; path: Path }[],
  targets: ReadonlySet<string>,
  ctx: z.RefinementCtx,
  what: string
): void {
  for (const link of links) {
    if (!targets.has(link.target)) {
      ctx.addIssue({
        code: 'custom',
        path: link.path,
        message: `Link "#${link.target}" does not match ${what}`,
      });
    }
  }
}
