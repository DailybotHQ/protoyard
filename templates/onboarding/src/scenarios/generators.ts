import type {
  GenerateContext,
  Membership,
  Organization,
  Persona,
  WorldSeed,
} from '@protoyard/core';
import { createAvatarPool } from '@protoyard/scenarios';
import type { Invitation, OnboardingState, Workspace } from '../database/schema.ts';
import { stepsForProgress } from '../domain/steps.ts';
import { slugify } from '../domain/validation.ts';

/**
 * Deterministic world builder. Everything random comes from `ctx.rng` and
 * every date from `ctx.time` (anchored at the scenario reference time), so
 * the same scenario renders the same world everywhere.
 *
 * The actor's wizard position comes from `scenario.actor.onboardingProgress`
 * (falling back to `onboardingComplete`), so one generator serves every
 * lifecycle stage.
 */

/** v2: personas carry library avatars (`av-NNN`), shown as photos. */
export const ONBOARDING_GENERATOR_VERSION = 2;

/** Fixed people, so links like `?actor=user_0004` always mean the same person. */
const PEOPLE = [
  { id: 'user_0001', name: 'Olivia Hart', title: 'Founder', role: 'owner', color: '#7c3aed' },
  {
    id: 'user_0002',
    name: 'Marcus Chen',
    title: 'Operations lead',
    role: 'admin',
    color: '#0891b2',
  },
  {
    id: 'user_0003',
    name: 'Priya Nair',
    title: 'Product designer',
    role: 'member',
    color: '#059669',
  },
  { id: 'user_0004', name: 'Victor Lane', title: 'Advisor', role: 'viewer', color: '#d97706' },
] as const;

const TEAMMATE_EMAILS = [
  'sam.rivera@example.com',
  'noor.haddad@example.com',
  'lee.park@example.com',
];

export function generateOnboardingWorld(ctx: GenerateContext): WorldSeed {
  const { scenario, time, rng } = ctx;
  const ageDays = scenario.organization.ageDays;
  const orgCreated = time.iso(time.daysAgo(ageDays));
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Acme Cloud',
    type: 'company',
    plan: 'pro',
    billingStatus: 'trialing',
    createdAt: orgCreated,
    size: PEOPLE.length,
    featureFlags: { ...scenario.organization.featureFlags },
  };

  const actorProgress =
    scenario.actor.onboardingProgress ?? (scenario.actor.onboardingComplete ? 1 : 0);
  const actorJoinedDays = Math.min(ageDays, scenario.actor.joinedDaysAgo);
  // A brand-new workspace has only its founder; an older one has the whole team.
  const people = ageDays === 0 ? PEOPLE.filter((p) => p.id === scenario.actor.id) : PEOPLE;

  // Library faces (`av-NNN`) from their own fork: no other seeded value shifts.
  const faces = createAvatarPool(ctx.rng.fork('onboarding:avatars:people'));
  const personas: Persona[] = [];
  const memberships: Membership[] = [];
  people.forEach((p, index) => {
    const isActor = p.id === scenario.actor.id;
    const days = isActor
      ? actorJoinedDays
      : index === 0
        ? ageDays
        : Math.round(ageDays * (1 - index / 5));
    const joinedAt = time.iso(time.daysAgo(days));
    const role = isActor ? scenario.actor.role : p.role;
    personas.push({
      id: p.id,
      name: p.name,
      avatar: faces.next(),
      email: `${p.name.split(' ')[0]?.toLowerCase()}@example.com`,
      title: p.title,
      avatarColor: p.color,
      locale: 'en-US',
      timezone: 'UTC',
      joinedAt,
      onboardingComplete: isActor ? actorProgress >= 1 : true,
      preferences: {},
      summary: `${p.title} · ${role}${isActor ? `, onboarding ${Math.round(actorProgress * 100)}%` : ''}`,
    });
    memberships.push({
      id: `membership_${String(index + 1).padStart(4, '0')}`,
      personaId: p.id,
      organizationId: organization.id,
      role,
      joinedAt,
      capabilities: [],
    });
  });

  const actor = personas.find((p) => p.id === scenario.actor.id) ?? personas[0];
  const actorId = actor?.id ?? 'user_0001';
  const { completed, current } = stepsForProgress(actorProgress);
  // People start onboarding right after joining (never after the reference time).
  const joinedMs = Date.parse(actor?.joinedAt ?? time.iso(time.now));
  const startedAt = time.iso(new Date(Math.min(time.now.getTime(), joinedMs + 20 * 60_000)));
  const done = completed.length === 4;
  // Whoever finished the workspace step configured it; otherwise only the signup defaults exist.
  const workspaceConfigured = completed.includes('workspace') || scenario.actor.role === 'viewer';
  const configuredBy = scenario.actor.role === 'viewer' ? 'user_0001' : actorId;

  const workspace: Workspace = {
    id: organization.id,
    name: organization.name,
    slug: slugify(organization.name),
    teamSize: workspaceConfigured ? rng.pick(['2-10', '11-50'] as const) : null,
    useCase: workspaceConfigured ? rng.pick(['projects', 'support', 'internal'] as const) : null,
    updatedAt: workspaceConfigured ? startedAt : orgCreated,
    updatedBy: configuredBy,
  };

  const invites = completed.includes('invite')
    ? rng
        .sample(TEAMMATE_EMAILS, 2)
        .map((email, i) => ({ email, role: i === 0 ? ('admin' as const) : ('member' as const) }))
    : [];
  const invitations: Invitation[] = invites.map((invite) => ({
    id: ctx.ids.next('invitation'),
    email: invite.email,
    role: invite.role,
    invitedBy: actorId,
    status: 'pending',
    createdAt: startedAt,
  }));

  const onboarding: OnboardingState[] =
    actorProgress === 0
      ? [] // Nothing persisted yet: the wizard starts fresh at step 1.
      : [
          {
            id: actorId,
            personaId: actorId,
            currentStep: done ? 'done' : current,
            completedSteps: completed,
            skippedSteps: [],
            profile: completed.includes('profile')
              ? {
                  fullName: actor?.name ?? 'Olivia Hart',
                  jobTitle: actor?.title ?? '',
                  department: rng.pick(['Product', 'Operations', 'Engineering'] as const),
                  timezone: 'America/New_York',
                }
              : null,
            invites,
            preferences: completed.includes('preferences')
              ? { mode: 'system', digest: 'weekly', productUpdates: true, mentions: true }
              : null,
            startedAt,
            updatedAt: startedAt,
            completedAt: done ? startedAt : null,
          },
        ];

  return {
    organizations: [organization],
    personas,
    memberships,
    tables: { onboarding, workspaces: [workspace], invitations },
  };
}
