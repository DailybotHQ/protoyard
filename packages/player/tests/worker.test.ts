// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Blueprint,
  blueprintScenarios,
  definePrototypeFromBlueprint,
  parseBlueprint,
} from '@protoyard/blueprint';
import type { Scenario } from '@protoyard/core';
import { createGenerateContextAsync, PRESETS, resolveScenarios } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { handleGenerateWorldRequest } from '../src/worker/generate-worker-runtime.ts';
import {
  type GenerateWorldWorker,
  generatePlayerWorld,
  WorldGenerationError,
  withWorkerGeneration,
} from '../src/worker/generate-world.ts';
import type { GenerateWorldReply, GenerateWorldRequest } from '../src/worker/protocol.ts';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const CATALOG_DIR = join(REPO_ROOT, 'blueprints');

class LocalWorker implements GenerateWorldWorker {
  onmessage: ((event: MessageEvent<GenerateWorldReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  requestKeys: string[] = [];

  postMessage(request: GenerateWorldRequest): void {
    this.requestKeys = Object.keys(request).sort();
    const cloned = structuredClone(request);
    void handleGenerateWorldRequest(cloned).then((data) => {
      this.onmessage?.({ data } as MessageEvent<GenerateWorldReply>);
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

function catalogSamples(): { slug: string; blueprint: Blueprint }[] {
  return readdirSync(CATALOG_DIR)
    .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    .sort()
    .slice(0, 5)
    .map((name) => ({
      slug: name.slice(0, -'.json'.length),
      blueprint: parseBlueprint(JSON.parse(readFileSync(join(CATALOG_DIR, name), 'utf8'))),
    }));
}

function scenariosFor(blueprint: Blueprint): Scenario[] {
  return resolveScenarios(blueprintScenarios(blueprint), PRESETS);
}

describe('player worker generation', () => {
  it('matches main-thread fallback byte for byte for five catalog blueprints and four scenarios', async () => {
    const blueprints = catalogSamples();
    expect(blueprints).toHaveLength(5);
    const worker = new LocalWorker();

    for (const { slug, blueprint } of blueprints) {
      for (const scenario of scenariosFor(blueprint)) {
        const fromWorker = await generatePlayerWorld(blueprint, scenario, {
          createWorker: () => worker,
        });
        const fromMainThread = await generatePlayerWorld(blueprint, scenario, {
          createWorker: () => {
            throw new Error('Simulate a host without Web Worker support.');
          },
        });
        expect(JSON.stringify(fromWorker), `${slug}/${scenario.id}`).toBe(
          JSON.stringify(fromMainThread)
        );
      }
    }

    expect(worker.requestKeys).toEqual(['blueprint', 'scenario']);
    expect(worker.terminated).toBe(true);
  }, 120_000);

  it('falls back to the main thread after a worker failure', async () => {
    const { blueprint } = catalogSamples()[0]!;
    const scenario = scenariosFor(blueprint)[0]!;
    const failedWorker: GenerateWorldWorker = {
      onmessage: null,
      onerror: null,
      postMessage() {
        this.onerror?.({ message: 'worker stopped', preventDefault() {} } as ErrorEvent);
      },
      terminate() {},
    };

    const fallback = await generatePlayerWorld(blueprint, scenario, {
      createWorker: () => failedWorker,
    });
    const direct = await generatePlayerWorld(blueprint, scenario, {
      createWorker: () => {
        throw new Error('Simulate an unavailable worker.');
      },
    });

    expect(JSON.stringify(fallback)).toBe(JSON.stringify(direct));
  }, 30_000);

  it('throws a generation error the worker reports, without generating again on the main thread', async () => {
    const { blueprint } = catalogSamples()[0]!;
    const scenario = scenariosFor(blueprint)[0]!;
    let terminated = false;
    const failingGeneration: GenerateWorldWorker = {
      onmessage: null,
      onerror: null,
      postMessage() {
        queueMicrotask(() =>
          this.onmessage?.({
            data: { ok: false, message: 'scenario cannot be generated' },
          } as MessageEvent<GenerateWorldReply>)
        );
      },
      terminate() {
        terminated = true;
      },
    };
    const outcome = generatePlayerWorld(blueprint, scenario, {
      createWorker: () => failingGeneration,
    });
    await expect(outcome).rejects.toBeInstanceOf(WorldGenerationError);
    await expect(outcome).rejects.toThrow('scenario cannot be generated');
    expect(terminated).toBe(true);
  }, 30_000);

  it('gives the player definition a generateWorld that matches the generate path byte for byte', async () => {
    const workers: LocalWorker[] = [];
    const createWorker = () => {
      const worker = new LocalWorker();
      workers.push(worker);
      return worker;
    };
    for (const { slug, blueprint } of catalogSamples().slice(0, 2)) {
      const { definition: base } = definePrototypeFromBlueprint(blueprint, {
        namespace: `worker-${slug}`,
        slug: `worker-${slug}`,
      });
      const definition = withWorkerGeneration(base, blueprint, { createWorker });
      expect(typeof definition.generateWorld).toBe('function');
      expect(definition.generate).toBeTypeOf('function');

      for (const scenario of scenariosFor(blueprint)) {
        const before = workers.length;
        const viaWorld = await definition.generateWorld?.(scenario);
        // generateWorld posts only data to a worker: no context is built for it.
        expect(workers.length).toBe(before + 1);
        expect(workers.at(-1)?.requestKeys).toEqual(['blueprint', 'scenario']);
        const viaGenerate = await base.generate(await createGenerateContextAsync(scenario));
        const viaWrappedGenerate = await definition.generate(
          await createGenerateContextAsync(scenario)
        );
        expect(JSON.stringify(viaWorld), `${slug}/${scenario.id}`).toBe(
          JSON.stringify(viaGenerate)
        );
        expect(JSON.stringify(viaWrappedGenerate), `${slug}/${scenario.id}`).toBe(
          JSON.stringify(viaGenerate)
        );
      }
    }
  }, 120_000);
});
