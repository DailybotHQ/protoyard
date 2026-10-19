import type { ScenarioInput } from '@protoyard/core';

const referenceTime = '2026-10-19T13:00:00.000Z';
const organization = { id: 'org_0001', name: 'Northstar Household', ageDays: 180, size: 3 };
const base = { referenceTime, organization };

export const scenarios: ScenarioInput[] = [
  {
    ...base,
    id: 'active',
    name: 'Everyday finances',
    description: 'A household tracks payday cash flow, categorized spending and monthly budgets.',
    group: 'Household',
    seed: 4226,
    density: 'normal',
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 120 },
    generators: { fintech: { historyDays: 90 } },
    tags: ['default'],
  },
  {
    ...base,
    id: 'empty',
    name: 'New financial workspace',
    description: 'A new workspace with empty accounts and monthly budget categories.',
    group: 'Lifecycle',
    seed: 91,
    density: 'empty',
    actor: { id: 'user_0001', role: 'owner', joinedDaysAgo: 0 },
    organization: { ...organization, ageDays: 0 },
    generators: { fintech: { historyDays: 0 } },
  },
  {
    ...base,
    id: 'viewer',
    name: 'Accountant read-only review',
    description: 'The owner account is visible to an accountant persona without transfer controls.',
    group: 'Roles',
    seed: 4226,
    density: 'normal',
    actor: { id: 'user_0003', role: 'viewer', joinedDaysAgo: 70 },
    generators: { fintech: { historyDays: 90 } },
  },
  {
    ...base,
    id: 'network-offline',
    name: 'Transfer while offline',
    description: 'Accounts and history remain readable while simulated transfers are unavailable.',
    group: 'Conditions',
    seed: 4226,
    density: 'normal',
    actor: { id: 'user_0002', role: 'member', joinedDaysAgo: 95 },
    environment: { network: 'offline' },
    generators: { fintech: { historyDays: 90 } },
  },
];
