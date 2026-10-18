import type { GenerateContext, WorldSeed } from '@protoyard/core';
import { generateCrudWorld } from '../generated/scenarios.ts';
import { enrichHelpdeskWorld } from './helpdesk.ts';

/** The blueprint world, enriched into a believable help desk (owned file). */
export async function generate(ctx: GenerateContext): Promise<WorldSeed> {
  return enrichHelpdeskWorld(await generateCrudWorld(ctx), ctx);
}

/** Folder-contract alias kept from the template. */
export const generateBlankWorld = generate;
