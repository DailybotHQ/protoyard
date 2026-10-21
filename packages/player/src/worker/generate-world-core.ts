import type { Blueprint } from '@protoyard/blueprint';
import type { GenerateContext, Scenario, WorldSeed } from '@protoyard/core';

/** Build a blueprint world from serializable inputs in the worker or fallback chunk. */
export async function generateBlueprintWorld(
  blueprint: Blueprint,
  scenario: Scenario,
  context?: GenerateContext
): Promise<WorldSeed> {
  const { createBlueprintGenerator } = await import('@protoyard/blueprint/generator');
  if (context) return createBlueprintGenerator(blueprint).generate(context);
  const { createGenerateContextAsync } = await import('@protoyard/scenarios');
  return createBlueprintGenerator(blueprint).generate(await createGenerateContextAsync(scenario));
}
