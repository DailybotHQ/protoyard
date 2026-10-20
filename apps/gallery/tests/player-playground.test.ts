// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_PASTED_BLUEPRINT_BYTES,
  parsePastedBlueprint,
} from '../src/components/player/blueprint.ts';

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'blueprints/field-service-dispatch.json'), 'utf8')
);

describe('hosted player paste validation', () => {
  it('accepts a valid blueprint document', () => {
    expect(parsePastedBlueprint(JSON.stringify(fixture))).toMatchObject({
      name: 'Waymark Field Service',
    });
  });

  it('rejects oversized input before trying to parse JSON', () => {
    expect(() => parsePastedBlueprint(' '.repeat(MAX_PASTED_BLUEPRINT_BYTES + 1))).toThrow(
      `This paste is larger than ${MAX_PASTED_BLUEPRINT_BYTES} bytes.`
    );
  });

  it('rejects malformed JSON and invalid blueprint data', () => {
    expect(() => parsePastedBlueprint('{')).toThrow();
    expect(() => parsePastedBlueprint('{"name":"not a blueprint"}')).toThrow();
  });
});
