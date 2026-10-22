// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectBlueprintKind } from '@protoyard/blueprint';
import { describe, expect, it } from 'vitest';
import {
  MAX_PASTED_BLUEPRINT_BYTES,
  parsePastedBlueprint,
} from '../src/components/player/blueprint.ts';

const fixtures = [
  ['app', 'blueprints/field-service-dispatch.json'],
  ['deck', 'packages/blueprint/tests/fixtures/kinds/minimal.deck.json'],
  ['page', 'packages/blueprint/tests/fixtures/kinds/landing.page.json'],
  ['doc', 'packages/blueprint/tests/fixtures/kinds/quarterly-report.doc.json'],
] as const;
const readFixture = (path: string) =>
  JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) as Record<string, unknown>;

const appFixture = readFixture(fixtures[0][1]);

describe('hosted player paste validation', () => {
  it.each(fixtures)('accepts a valid %s blueprint document', async (kind, path) => {
    const blueprint = await parsePastedBlueprint(JSON.stringify(readFixture(path)));
    const detected = detectBlueprintKind(blueprint);
    expect(detected.ok && detected.kind).toBe(kind);
  });

  it.each(fixtures)('names the %s kind when validation fails', async (kind, path) => {
    const invalid = { ...readFixture(path), description: 42 };
    const label = kind === 'doc' ? 'Document' : `${kind[0]?.toUpperCase()}${kind.slice(1)}`;
    await expect(parsePastedBlueprint(JSON.stringify(invalid))).rejects.toThrow(
      `${label} blueprint validation failed:`
    );
  });

  it('preserves the oversize fallback for a deck before parsing it', async () => {
    const deck = readFixture(fixtures[1][1]);
    const oversized = JSON.stringify({
      ...deck,
      description: 'x'.repeat(MAX_PASTED_BLUEPRINT_BYTES),
    });
    await expect(parsePastedBlueprint(oversized)).rejects.toThrow(
      `This paste is larger than ${MAX_PASTED_BLUEPRINT_BYTES} bytes. Open a smaller blueprint file.`
    );
  });

  it('rejects malformed JSON and invalid app data with clear errors', async () => {
    await expect(parsePastedBlueprint('{')).rejects.toThrow(/JSON|json/);
    await expect(
      parsePastedBlueprint(JSON.stringify({ ...appFixture, entities: 'not entities' }))
    ).rejects.toThrow('App blueprint validation failed:');
  });
});
