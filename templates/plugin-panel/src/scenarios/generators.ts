import type {
  GenerateContext,
  Membership,
  Organization,
  Persona,
  WorldSeed,
} from '@protoyard/core';
import type { ConnectedItem, PluginSettings, Provider } from '../database/schema.ts';

const PEOPLE = [
  { id: 'user_0001', name: 'Olivia Hart', role: 'owner', email: 'olivia.hart@example.com' },
  { id: 'user_0002', name: 'Mateo Silva', role: 'member', email: 'mateo.silva@example.com' },
  { id: 'user_0003', name: 'Nora Kim', role: 'viewer', email: 'nora.kim@example.com' },
] as const;
const PROVIDER_CHOICES: readonly Provider[] = [
  'Northstar Drive',
  'Copperline Calendar',
  'Tandem Tasks',
];

export function generatePluginWorld(ctx: GenerateContext): WorldSeed {
  const { scenario, time, rng } = ctx;
  const org: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Orbit Studio',
    type: 'company',
    plan: 'pro',
    billingStatus: 'active',
    createdAt: time.iso(time.daysAgo(scenario.organization.ageDays)),
    size: PEOPLE.length,
    featureFlags: {},
  };
  const people =
    scenario.organization.ageDays === 0
      ? PEOPLE.filter((person) => person.id === scenario.actor.id)
      : PEOPLE;
  const personas: Persona[] = people.map((person) => ({
    id: person.id,
    name: person.name,
    email: person.email,
    title: person.role === 'owner' ? 'Workspace owner' : 'Team member',
    avatarColor: person.id === 'user_0001' ? '#d98165' : '#5c8d89',
    locale: 'en-US',
    timezone: 'UTC',
    joinedAt: time.iso(
      time.daysAgo(
        person.id === scenario.actor.id
          ? scenario.actor.joinedDaysAgo
          : scenario.organization.ageDays
      )
    ),
    onboardingComplete: true,
    preferences: {},
    summary: `${person.role} · ${person.name}`,
  }));
  const memberships: Membership[] = people.map((person, index) => ({
    id: `membership_${String(index + 1).padStart(4, '0')}`,
    personaId: person.id,
    organizationId: org.id,
    role: person.id === scenario.actor.id ? scenario.actor.role : person.role,
    joinedAt: personas[index]?.joinedAt ?? time.iso(time.now),
    capabilities: [],
  }));

  const connected = scenario.id !== 'empty';
  const connectedItems: ConnectedItem[] = connected
    ? PROVIDER_CHOICES.slice(0, scenario.id === 'connected-workspace' ? 2 : 1).map(
        (provider, index) => {
          const daysAgo = rng.int(1, 9);
          const at = time.iso(time.daysAgo(daysAgo));
          return {
            id: ctx.ids.next('integration'),
            label:
              provider === 'Northstar Drive'
                ? 'Design files'
                : provider === 'Copperline Calendar'
                  ? 'Team calendar'
                  : 'Release checklist',
            provider,
            account:
              provider === 'Copperline Calendar'
                ? 'mateo.silva@example.com'
                : 'olivia.hart@example.com',
            syncState: scenario.id === 'sync-paused' && index === 0 ? 'paused' : 'active',
            connectedAt: time.iso(time.daysAgo(daysAgo + 10)),
            updatedAt: at,
          };
        }
      )
    : [];
  const settings: PluginSettings = {
    id: 'workspace',
    autoSync: scenario.id !== 'sync-paused',
    notifyOnChange: true,
    updatedAt: time.iso(time.daysAgo(Math.min(2, scenario.organization.ageDays))),
  };

  return {
    organizations: [org],
    personas,
    memberships,
    tables: { connectedItems, settings: [settings] },
  };
}
