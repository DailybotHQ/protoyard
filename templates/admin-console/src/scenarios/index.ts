import type { ScenarioInput } from '@protoyard/core';
import { presetScenario } from '@protoyard/scenarios/presets';

/**
 * Scenarios are versioned, seeded worlds built from the shared presets in
 * @protoyard/scenarios plus this template's knobs. Add one by appending an
 * entry here AND listing its id in protoyard.json → "scenarios".
 *
 * `generators.admin` is read by `generators.ts`:
 *   tenants        how many customer organizations exist
 *   suspendedShare share of non-churned tenants that are suspended (0..1)
 *   pastDueShare   share of paying tenants whose last payment failed (0..1)
 */

export const REFERENCE_TIME = '2026-10-16T09:00:00.000Z';

export interface AdminGeneratorOptions {
  tenants: number;
  suspendedShare: number;
  pastDueShare: number;
}

/** The staff organization: two years old so every tenant is younger. */
const organization = {
  id: 'org_0001',
  name: 'Northwind Ops',
  size: 4,
  ageDays: 730,
  type: 'internal',
};
const staffActor = (id: string, role: string, joinedDaysAgo: number) => ({
  id,
  role,
  joinedDaysAgo,
});
const operations = {
  tenants: 24,
  suspendedShare: 0.08,
  pastDueShare: 0.1,
} satisfies AdminGeneratorOptions;

export const scenarios: ScenarioInput[] = [
  presetScenario('brand-new-signup', {
    id: 'empty',
    name: 'Day one',
    description: 'The console just went live: no tenants yet. Shows every empty state.',
    seed: 301,
    referenceTime: REFERENCE_TIME,
    organization,
    actor: staffActor('user_0001', 'owner', 0),
    generators: { admin: { tenants: 0, suspendedShare: 0, pastDueShare: 0 } },
  }),
  presetScenario('active-month', {
    id: 'operations',
    name: 'Normal operations',
    description:
      'Two dozen tenants in every state, their people, subscriptions and a steady audit log, seen by the platform owner.',
    seed: 7310,
    referenceTime: REFERENCE_TIME,
    organization,
    actor: staffActor('user_0001', 'owner', 700),
    generators: { admin: operations },
    tags: ['default'],
  }),
  presetScenario('active-month', {
    id: 'incident',
    name: 'Incident day',
    description:
      'A rough day: many tenants suspended or past due. Good for triage, filters and reactivation flows.',
    seed: 9120,
    referenceTime: REFERENCE_TIME,
    organization,
    actor: staffActor('user_0002', 'admin', 400),
    generators: { admin: { tenants: 30, suspendedShare: 0.3, pastDueShare: 0.35 } },
  }),
  presetScenario('active-month', {
    id: 'support-agent',
    name: 'Support agent',
    description:
      'Same world as “Normal operations”, seen by a support agent: can read and impersonate, cannot suspend, disable or change billing.',
    seed: 7310,
    referenceTime: REFERENCE_TIME,
    organization,
    actor: staffActor('user_0003', 'member', 120),
    generators: { admin: operations },
  }),
  presetScenario('read-only-viewer', {
    id: 'auditor',
    name: 'Auditor (read-only)',
    description:
      'Same world as “Normal operations”, seen by an auditor: everything is visible, every action is hidden and blocked.',
    seed: 7310,
    referenceTime: REFERENCE_TIME,
    organization,
    actor: staffActor('user_0004', 'viewer', 60),
    generators: { admin: operations },
  }),
];
