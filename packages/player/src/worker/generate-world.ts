import type { Blueprint } from '@protoyard/blueprint';
import type { GenerateContext, PrototypeDefinition, Scenario, WorldSeed } from '@protoyard/core';
import type { GenerateWorldReply, GenerateWorldRequest } from './protocol.ts';

export interface GenerateWorldWorker {
  onmessage: ((event: MessageEvent<GenerateWorldReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: GenerateWorldRequest): void;
  terminate(): void;
}

/**
 * A generation error the worker reported (`{ ok: false }`): the blueprint or
 * scenario cannot be generated, so running it again on the main thread would
 * only fail a second time while blocking the page.
 */
export class WorldGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorldGenerationError';
  }
}

export interface WorkerGenerationOptions {
  /** Test seam; browsers use the module worker by default. */
  createWorker?: () => GenerateWorldWorker;
}

function createBrowserWorker(): GenerateWorldWorker {
  if (typeof Worker === 'undefined') throw new Error('Web Workers are unavailable.');
  return new Worker(new URL('./generate.worker.ts', import.meta.url), {
    type: 'module',
  });
}

async function generateOnMainThread(
  blueprint: Blueprint,
  scenario: Scenario,
  context?: GenerateContext
): Promise<WorldSeed> {
  const { generateBlueprintWorld } = await import('./generate-world-core.ts');
  return generateBlueprintWorld(blueprint, scenario, context);
}

async function generateWithWorker(
  worker: GenerateWorldWorker,
  request: GenerateWorldRequest
): Promise<WorldSeed> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      worker.terminate();
    };

    worker.onmessage = ({ data }) => {
      finish();
      if (data.ok) resolve(data.world);
      else reject(new WorldGenerationError(data.message));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish();
      reject(new Error(event.message || 'World generation worker failed.'));
    };

    try {
      worker.postMessage(request);
    } catch (error) {
      finish();
      reject(error);
    }
  });
}

/**
 * Generate from blueprint + scenario data. The main thread takes over only
 * when the worker is unavailable: it cannot be created, or it fails to start
 * or run (`onerror`). A generation error the worker reports is thrown as a
 * {@link WorldGenerationError}, never generated a second time. The main-thread
 * fallback is a lazy chunk, so the generator is absent from the player's
 * initial graph.
 */
export async function generatePlayerWorld(
  blueprint: Blueprint,
  scenario: Scenario,
  options: WorkerGenerationOptions = {},
  fallbackContext?: GenerateContext
): Promise<WorldSeed> {
  try {
    const worker = (options.createWorker ?? createBrowserWorker)();
    return await generateWithWorker(worker, { blueprint, scenario });
  } catch (error) {
    if (error instanceof WorldGenerationError) throw error;
    return generateOnMainThread(blueprint, scenario, fallbackContext);
  }
}

/** Keep the runtime contract; only the data needed by the worker crosses threads. */
export function withWorkerGeneration(
  definition: PrototypeDefinition,
  blueprint: Blueprint,
  options: WorkerGenerationOptions = {}
): PrototypeDefinition {
  return {
    ...definition,
    generate: (context: GenerateContext) =>
      generatePlayerWorld(blueprint, context.scenario, options, context),
    // Scenario loads call this, so the main thread never builds a context.
    generateWorld: (scenario: Scenario) => generatePlayerWorld(blueprint, scenario, options),
  };
}
