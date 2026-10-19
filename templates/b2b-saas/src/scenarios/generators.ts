import type { GenerateContext, WorldSeed } from '@protoyard/core';
import { generateSaasWorld } from '@protoyard/saas';
import { generateTeam } from '@protoyard/scenarios';
import type { Project } from '../database/schema.ts';

/** v2: personas carry library avatars (`generateTeam`), shown as photos. */
export const B2B_SAAS_GENERATOR_VERSION = 2;

const PROJECT_NAMES = [
  'Customer portal',
  'Analytics launch',
  'Partner workspace',
  'Billing refresh',
];

export function generateB2bSaasWorld(ctx: GenerateContext): WorldSeed {
  const generatedTeam = generateTeam(ctx);
  const actor = { ...generatedTeam.actor, email: 'owner@example.com' };
  const personas = generatedTeam.personas.map((persona) =>
    persona.id === actor.id ? actor : persona
  );
  const team = { ...generatedTeam, actor, personas };
  const saas = generateSaasWorld(ctx, { team });
  const organization = saas.organizations.find(
    (candidate) => candidate.id === team.organization.id
  );
  if (!organization) throw new Error('The SaaS scenario needs its primary organization.');
  const organizationStart = Date.parse(organization.createdAt);
  const latestProjectAge = Math.max(
    0,
    Math.floor((ctx.time.now.getTime() - organizationStart) / 86_400_000)
  );

  const projects: Project[] = PROJECT_NAMES.map((name, index) => {
    const createdAt = ctx.time.iso(ctx.time.daysAgo(ctx.rng.int(0, latestProjectAge)));
    return {
      id: ctx.ids.next('project'),
      organizationId: organization.id,
      ownerPersonaId: actor.id,
      name,
      summary: ctx.faker.company.buzzPhrase(),
      status: index === 0 ? 'active' : index === 3 ? 'complete' : 'planning',
      createdAt,
      updatedAt: createdAt,
    };
  });

  return {
    ...saas,
    tables: { ...saas.tables, projects },
  };
}
