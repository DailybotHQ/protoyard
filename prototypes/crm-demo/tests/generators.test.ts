import type { WorldSeed } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { contextFor as buildContext } from '../../../tests/support/generate-context.ts';
import type { Activity, Company, Contact, Deal } from '../src/database/schema.ts';
import { definition } from '../src/prototype.ts';
import { generateCrmWorld } from '../src/scenarios/generators.ts';

const contextFor = (id: string, seed?: number) => buildContext(definition.scenarios, id, seed);

const rows = <T>(world: WorldSeed, table: string) => (world.tables[table] ?? []) as unknown as T[];

describe('crm-demo generator', () => {
  it('is deterministic for the same seed and differs for another seed', async () => {
    const a = await generateCrmWorld(contextFor('growing-team'));
    const b = await generateCrmWorld(contextFor('growing-team'));
    expect(a).toEqual(b);
    const c = await generateCrmWorld(contextFor('growing-team', 77));
    expect(c.tables.deals).not.toEqual(a.tables.deals);
  });

  it('keeps every reference valid and every timestamp inside the world', async () => {
    for (const scenario of definition.scenarios) {
      const ctx = contextFor(scenario.id);
      const world = await generateCrmWorld(ctx);
      const personaIds = new Set(world.personas.map((p) => p.id));
      const companyIds = new Set(rows<Company>(world, 'companies').map((c) => c.id));
      const contactIds = new Set(rows<Contact>(world, 'contacts').map((c) => c.id));
      const dealIds = new Set(rows<Deal>(world, 'deals').map((d) => d.id));
      const orgCreated = Date.parse(world.organizations[0]?.createdAt ?? '');
      const now = Date.parse(ctx.scenario.referenceTime);

      expect(personaIds.has(ctx.scenario.actor.id), `${scenario.id}: actor exists`).toBe(true);
      const actorMembership = world.memberships.find((m) => m.personaId === ctx.scenario.actor.id);
      expect(actorMembership?.role).toBe(ctx.scenario.actor.role);

      for (const contact of rows<Contact>(world, 'contacts')) {
        expect(companyIds.has(contact.companyId)).toBe(true);
      }
      for (const deal of rows<Deal>(world, 'deals')) {
        expect(companyIds.has(deal.companyId)).toBe(true);
        expect(personaIds.has(deal.ownerId)).toBe(true);
        if (deal.contactId) expect(contactIds.has(deal.contactId)).toBe(true);
        expect(Date.parse(deal.createdAt)).toBeGreaterThanOrEqual(orgCreated);
        expect(Date.parse(deal.createdAt)).toBeLessThanOrEqual(now);
      }
      for (const activity of rows<Activity>(world, 'activities')) {
        if (activity.dealId) expect(dealIds.has(activity.dealId)).toBe(true);
        expect(personaIds.has(activity.actorId)).toBe(true);
        expect(Date.parse(activity.at)).toBeGreaterThanOrEqual(orgCreated);
        expect(Date.parse(activity.at)).toBeLessThanOrEqual(now);
      }
    }
  });

  it('makes new-company empty and mature-company dense', async () => {
    const empty = await generateCrmWorld(contextFor('new-company'));
    expect(rows(empty, 'deals')).toHaveLength(0);
    expect(empty.personas).toHaveLength(1);
    const mature = await generateCrmWorld(contextFor('mature-company'));
    expect(rows(mature, 'deals').length).toBeGreaterThan(150);
  });

  it('gives the rep persona deals of their own in rep-view', async () => {
    const world = await generateCrmWorld(contextFor('rep-view'));
    expect(rows<Deal>(world, 'deals').some((d) => d.ownerId === 'user_0003')).toBe(true);
  });
});
