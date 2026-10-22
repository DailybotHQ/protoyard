// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  CAPABILITIES,
  CAPABILITY_IDS,
  DOCTOR_INTERFACE,
  doctorCommand,
} from '../src/commands/doctor.ts';
import { cli } from './helpers.ts';

/**
 * Kind capabilities on the machine interface (Task 145 / T-kinds-doctor-mcp):
 * `kind-deck`, `kind-page` and `kind-doc` are additive under interface 1.
 */

const KIND_CAPABILITIES = ['kind-deck', 'kind-doc', 'kind-page'] as const;

describe('doctor kind capabilities (T-kinds-doctor-mcp)', () => {
  it('defines kind-deck, kind-doc and kind-page on CAPABILITY_IDS in sorted order', () => {
    expect(CAPABILITY_IDS).toEqual([...CAPABILITY_IDS].sort());
    for (const id of KIND_CAPABILITIES) {
      expect(CAPABILITY_IDS, id).toContain(id);
    }
    expect(DOCTOR_INTERFACE).toBe(1);
  });

  it('lists the kind capabilities sorted among implemented CAPABILITIES', () => {
    expect(CAPABILITIES).toEqual([...CAPABILITIES].sort());
    expect([...CAPABILITIES]).toEqual(expect.arrayContaining([...KIND_CAPABILITIES]));
    const kinds = CAPABILITIES.filter((id) => id.startsWith('kind-'));
    expect(kinds).toEqual([...KIND_CAPABILITIES]);
    expect(doctorCommand.envelope).toEqual({
      interface: 1,
      capabilities: CAPABILITIES,
    });
  });

  it('reports kind-deck from doctor --json (AC-kinds-dm-cli)', async () => {
    const result = await cli(['--json', 'doctor', '--offline']);
    expect(result.code, result.stdout).toBeLessThan(4);
    const envelope = result.json<{
      interface: number;
      capabilities: string[];
    }>();
    expect(envelope.interface).toBe(1);
    expect(envelope.capabilities).toEqual([...CAPABILITIES]);
    expect(envelope.capabilities).toContain('kind-deck');
    expect(envelope.capabilities).toContain('kind-page');
    expect(envelope.capabilities).toContain('kind-doc');
    // Sorted as advertised.
    expect(envelope.capabilities).toEqual([...envelope.capabilities].sort());
  }, 60_000);
});
