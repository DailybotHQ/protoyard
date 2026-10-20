import { createAiEngine } from '@protoyard/ai';
import { createRng, type PrototypeRuntime } from '@protoyard/core';

/**
 * Runs the shared deterministic AI kit without a provider or network. The
 * player persists the resulting text through the blueprint entity service.
 */
export async function scriptedReply(
  runtime: PrototypeRuntime,
  conversationId: string,
  prompt: string
): Promise<string> {
  const seed = `${runtime.manifest.slug}:${conversationId}`;
  const engine = createAiEngine({
    context: {
      seed,
      rng: createRng(seed),
      clock: {
        now: () => runtime.clock.now(),
        nowMs: () => runtime.clock.nowMs(),
        sleep: async () => undefined,
      },
      environment: runtime.environment,
    },
    defaultCadenceMs: 0,
  });
  const branch = engine.createConversation(`player-${conversationId}`);
  const stream = engine.stream(branch.id, prompt, { cadenceMs: 0 });
  let output = '';
  for await (const chunk of stream) output += chunk.token;
  return output || 'The simulated assistant has no further detail yet.';
}
