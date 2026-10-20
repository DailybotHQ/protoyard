import { generateBlueprintWorld } from './generate-world-core.ts';
import type { GenerateWorldReply, GenerateWorldRequest } from './protocol.ts';

export interface GeneratorWorkerScope {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<GenerateWorldRequest>) => void
  ): void;
  postMessage(message: GenerateWorldReply): void;
}

export async function handleGenerateWorldRequest(
  request: GenerateWorldRequest
): Promise<GenerateWorldReply> {
  try {
    return {
      ok: true,
      world: await generateBlueprintWorld(request.blueprint, request.scenario),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'World generation failed.',
    };
  }
}

export function installGenerateWorldWorker(scope: GeneratorWorkerScope): void {
  scope.addEventListener('message', (event) => {
    void handleGenerateWorldRequest(event.data).then((reply) => scope.postMessage(reply));
  });
}
