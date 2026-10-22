import { PermissionDeniedError } from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import {
  createGenerateContext,
  PRESETS,
  resolveScenarios,
  validateWorld,
} from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { propsFromSource } from '../src/catalog/props.ts';
import type { DesignKitDatabase } from '../src/database/schema.ts';
import { createReviewServices } from '../src/domain/reviews.ts';
import { definition } from '../src/prototype.ts';
import { generateDesignKitWorld } from '../src/scenarios/generators.ts';

describe('design-kit template', () => {
  it('creates deterministic, referentially sound designer and reviewer worlds', () => {
    const resolved = resolveScenarios(definition.scenarios, PRESETS);
    for (const scenario of resolved) {
      const first = generateDesignKitWorld(createGenerateContext(scenario));
      expect(generateDesignKitWorld(createGenerateContext(scenario))).toEqual(first);
      expect(first.tables.reviews).toEqual([]);
      expect(first.personas.some((person) => person.id === scenario.actor.id)).toBe(true);
      expect(
        validateWorld(first, { ...definition.integrity, referenceTime: scenario.referenceTime })
      ).toEqual([]);
    }
  });

  it('extracts a component prop table from documented source annotations', () => {
    expect(propsFromSource('<!-- @prop tone: "quiet" | "loud" — Visual emphasis. -->')).toEqual([
      { name: 'tone', type: '"quiet" | "loud"', description: 'Visual emphasis.' },
    ]);
    expect(propsFromSource('No public props yet.')).toEqual([]);
  });

  describe('persisted reviews', () => {
    let close: (() => Promise<void>) | undefined;
    afterEach(async () => {
      await close?.();
      close = undefined;
    });

    it('saves one bounded review per persona and entry through the service', async () => {
      const runtime = await createPrototypeRuntime(definition, { sleep: async () => {} });
      close = () => runtime.destroy();
      await runtime.scenarios.ensureSeeded();
      const service = createReviewServices(
        runtime as unknown as import('@protoyard/core').PrototypeRuntime<DesignKitDatabase>
      );
      const first = await service.save({
        entryId: 'button',
        status: 'in-progress',
        note: 'Check focus ring.',
      });
      const updated = await service.save({
        entryId: 'button',
        status: 'approved',
        note: 'Looks good.',
      });
      expect(updated.id).toBe(first.id);
      const db = runtime.db as unknown as DesignKitDatabase;
      expect(await db.reviews.toArray()).toHaveLength(1);
      expect(await db.reviews.get(first.id)).toMatchObject({
        status: 'approved',
        note: 'Looks good.',
        personaId: 'user_0001',
      });
      await expect(
        service.save({ entryId: 'invalid entry', status: 'todo', note: '' })
      ).rejects.toThrow('Choose a catalog entry.');
      await expect(
        service.save({ entryId: 'button', status: 'todo', note: 'x'.repeat(501) })
      ).rejects.toThrow('500 characters');
    });

    it('blocks read-only personas at the service boundary', async () => {
      const runtime = await createPrototypeRuntime(definition, {
        link: { scenario: 'reviewer' },
        sleep: async () => {},
      });
      close = () => runtime.destroy();
      await runtime.scenarios.ensureSeeded();
      await expect(
        createReviewServices(
          runtime as unknown as import('@protoyard/core').PrototypeRuntime<DesignKitDatabase>
        ).save({ entryId: 'button', status: 'todo', note: '' })
      ).rejects.toBeInstanceOf(PermissionDeniedError);
    });
  });
});
