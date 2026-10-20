import type { GenerateContext, WorldSeed } from '@protoyard/core';
import { generateCrudWorld } from '../generated/scenarios.ts';

/** Folder-contract entry: delegates to the lazy blueprint generator. */
export function generateBlankWorld(ctx: GenerateContext): WorldSeed | Promise<WorldSeed> {
  return generateCrudWorld(ctx);
}

export { generateCrudWorld as generate };
