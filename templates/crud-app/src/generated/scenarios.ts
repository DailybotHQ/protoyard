/**
 * GENERATED — hash: crud-app-scenarios-v1
 * World generator from the blueprint (lazy entry so Faker stays out of the
 * initial chunk when the runtime loads generate).
 */
import type { GenerateContext, WorldSeed } from '@protoyard/core';
import { blueprint } from './blueprint.ts';

export async function generateCrudWorld(ctx: GenerateContext): Promise<WorldSeed> {
  const { createBlueprintGenerator } = await import('@protoyard/blueprint/generator');
  const { generate } = createBlueprintGenerator(blueprint);
  return generate(ctx);
}

export async function crudGeneratorVersion(): Promise<number> {
  const { blueprintGeneratorVersion } = await import('@protoyard/blueprint/generator');
  return blueprintGeneratorVersion(blueprint);
}
