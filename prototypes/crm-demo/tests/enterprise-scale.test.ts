import { parseScenario } from '@protoyard/core';
import { createPrototypeRuntime, type ProtoyardRuntime } from '@protoyard/runtime';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { definition } from '../src/prototype.ts';

const input = definition.scenarios.find((s) => s.id === 'enterprise-scale');

describe('enterprise-scale scenario', () => {
  it('is large, deterministic and referentially valid', () => {
    if (!input) throw new Error('enterprise-scale missing');
    const scenario = parseScenario(input);
    const world = definition.generate(createGenerateContext(scenario));
    if (world instanceof Promise) throw new Error('generator is sync');
    const counts = Object.fromEntries(
      Object.entries(world.tables).map(([name, rows]) => [name, rows.length])
    );
    expect(counts.companies).toBe(300);
    expect(counts.contacts).toBeGreaterThanOrEqual(800);
    expect(counts.contacts).toBeLessThanOrEqual(1000);
    expect(counts.deals).toBeGreaterThanOrEqual(2700);
    expect(counts.deals).toBeLessThanOrEqual(3300);
    expect(counts.activities).toBeGreaterThan(8000);
    expect(
      validateWorld(world, { ...definition.integrity, referenceTime: scenario.referenceTime })
    ).toEqual([]);
    const again = definition.generate(createGenerateContext(scenario));
    expect(JSON.stringify(again)).toBe(JSON.stringify(world));
  });
});

/**
 * Benchmark (opt-in): `PROTOYARD_BENCH=1 pnpm vitest run prototypes/crm-demo/tests/enterprise-scale.test.ts`.
 * Loads the scenario through the real runtime on fake-indexeddb with several
 * chunk sizes and prints per-phase timings. Numbers go to docs/PERFORMANCE.md.
 */
describe.skipIf(!process.env.PROTOYARD_BENCH)('enterprise-scale benchmark (Node)', () => {
  it('measures generate / validate / write per chunk size', async () => {
    const runs = Number(process.env.PROTOYARD_BENCH_RUNS ?? 3);
    const sizes = [250, 500, 1000, 2000, 1_000_000];
    const lines: string[] = [];
    for (const writeChunkSize of sizes) {
      const samples: {
        generateMs: number;
        validateMs: number;
        writeMs: number;
        rows: number;
        updates: number;
        maxGapMs: number;
      }[] = [];
      for (let r = 0; r < runs; r++) {
        const runtime: ProtoyardRuntime = await createPrototypeRuntime(definition, {
          indexedDB: new IDBFactory(),
          IDBKeyRange,
          sleep: async () => {},
          writeChunkSize,
          link: { scenario: 'new-company' },
        });
        await runtime.scenarios.ensureSeeded();
        let updates = 0;
        let last = performance.now();
        let maxGapMs = 0;
        await runtime.scenarios.load('enterprise-scale', {
          onProgress: (p) => {
            if (p.phase !== 'write') return;
            const now = performance.now();
            if (p.done > 0) maxGapMs = Math.max(maxGapMs, now - last);
            last = now;
            updates++;
          },
        });
        const t = runtime.scenarios.lastLoadTimings();
        if (!t) throw new Error('no timings');
        samples.push({ ...t, updates, maxGapMs });
        runtime.close();
      }
      const med = (key: 'generateMs' | 'validateMs' | 'writeMs' | 'maxGapMs') => {
        const sorted = samples.map((s) => s[key]).sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)] ?? 0;
      };
      const range = (key: 'writeMs') =>
        `${Math.min(...samples.map((s) => s[key])).toFixed(0)}–${Math.max(...samples.map((s) => s[key])).toFixed(0)}`;
      lines.push(
        `BENCH chunk=${writeChunkSize === 1_000_000 ? 'single' : writeChunkSize} rows=${samples[0]?.rows} runs=${runs} generate=${med('generateMs').toFixed(0)}ms validate=${med('validateMs').toFixed(0)}ms write=${med('writeMs').toFixed(0)}ms (range ${range('writeMs')}) progressUpdates=${samples[0]?.updates} maxGapBetweenUpdates=${med('maxGapMs').toFixed(0)}ms`
      );
    }
    for (const line of lines) console.log(line);
  }, 600_000);
});
