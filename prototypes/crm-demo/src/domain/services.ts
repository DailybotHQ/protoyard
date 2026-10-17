import { createRuntimeId, type PrototypeRuntime } from '@protoyard/core';
import { z } from 'zod';
import {
  type Activity,
  type ActivityType,
  type Company,
  type Contact,
  type CrmDatabase,
  DEAL_STAGES,
  type Deal,
  type DealStage,
  STAGE_PROBABILITY,
} from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';

/**
 * Domain services: the ONLY way the UI changes data. Each mutation
 *   1. checks the simulated policy (`session.assert`) — works even if the UI is bypassed,
 *   2. validates input with zod,
 *   3. runs through the simulated environment (latency / offline / failures),
 *   4. writes related rows in ONE Dexie transaction (e.g. deal + activity log).
 */

export const CompanyInputSchema = z.object({
  name: z.string().trim().min(2, 'Name must have at least 2 characters').max(80),
  industry: z.string().trim().min(1, 'Pick an industry'),
  employees: z.coerce.number().int().min(1, 'At least 1 employee').max(1_000_000),
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Use a domain like acme.example'),
  city: z.string().trim().max(60).default(''),
  tags: z.array(z.string().trim().min(1).max(24)).max(8).default([]),
});
export type CompanyInput = z.input<typeof CompanyInputSchema>;

export const ContactInputSchema = z.object({
  companyId: z.string().min(1, 'Pick a company'),
  firstName: z.string().trim().min(1, 'First name is required').max(40),
  lastName: z.string().trim().min(1, 'Last name is required').max(40),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: z.string().trim().max(32).default(''),
  title: z.string().trim().max(60).default(''),
});
export type ContactInput = z.input<typeof ContactInputSchema>;

export const DealInputSchema = z.object({
  title: z.string().trim().min(3, 'Title must have at least 3 characters').max(100),
  companyId: z.string().min(1, 'Pick a company'),
  contactId: z.string().nullable().default(null),
  ownerId: z.string().min(1).optional(),
  stage: z.enum(DEAL_STAGES).default('lead'),
  amount: z.coerce.number().min(0, 'Amount cannot be negative').max(100_000_000),
  closeDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Pick a close date'),
});
export type DealInput = z.input<typeof DealInputSchema>;

export class ValidationError extends Error {
  constructor(readonly issues: Record<string, string>) {
    super(Object.values(issues)[0] ?? 'Invalid input');
    this.name = 'ValidationError';
  }
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || 'form';
    issues[key] ??= issue.message;
  }
  throw new ValidationError(issues);
}

export const STAGE_LABELS: Record<DealStage, string> = {
  lead: 'Lead',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

export function createCrmServices(runtime: PrototypeRuntime<CrmDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  const actorId = () => {
    const principal = session.principal();
    if (!principal) throw new Error('No active persona. Load a scenario first.');
    return principal.persona.id;
  };

  const logActivity = (
    type: ActivityType,
    body: string,
    refs: Partial<Pick<Activity, 'dealId' | 'companyId' | 'contactId'>>
  ): Activity => ({
    id: createRuntimeId('activity'),
    type,
    body,
    dealId: refs.dealId ?? null,
    companyId: refs.companyId ?? null,
    contactId: refs.contactId ?? null,
    actorId: actorId(),
    at: now(),
  });

  return {
    companies: {
      async create(input: CompanyInput): Promise<Company> {
        session.assert(CAPABILITIES.companiesWrite);
        const data = parse(CompanyInputSchema, input);
        return environment.run('companies.create', () =>
          db.transaction('rw', db.companies, db.activities, async () => {
            const company: Company = {
              id: createRuntimeId('company'),
              ...data,
              ownerId: actorId(),
              createdAt: now(),
              updatedAt: now(),
            };
            await db.companies.add(company);
            await db.activities.add(
              logActivity('created', `Created company ${company.name}`, { companyId: company.id })
            );
            return company;
          })
        );
      },
      async update(id: string, input: CompanyInput): Promise<void> {
        session.assert(CAPABILITIES.companiesWrite);
        const data = parse(CompanyInputSchema, input);
        await environment.run('companies.update', () =>
          db.companies.update(id, { ...data, updatedAt: now() })
        );
      },
      /** Deletes the company and everything that belongs to it, atomically. */
      async remove(id: string): Promise<void> {
        session.assert(CAPABILITIES.companiesDelete);
        await environment.run('companies.delete', () =>
          db.transaction('rw', db.companies, db.contacts, db.deals, db.activities, async () => {
            const dealIds = await db.deals.where('companyId').equals(id).primaryKeys();
            await db.activities.where('companyId').equals(id).delete();
            await db.activities.where('dealId').anyOf(dealIds).delete();
            await db.deals.where('companyId').equals(id).delete();
            await db.contacts.where('companyId').equals(id).delete();
            await db.companies.delete(id);
          })
        );
      },
    },

    contacts: {
      async create(input: ContactInput): Promise<Contact> {
        session.assert(CAPABILITIES.contactsWrite);
        const data = parse(ContactInputSchema, input);
        return environment.run('contacts.create', () =>
          db.transaction('rw', db.companies, db.contacts, db.activities, async () => {
            if (!(await db.companies.get(data.companyId))) {
              throw new ValidationError({ companyId: 'That company no longer exists' });
            }
            const contact: Contact = {
              id: createRuntimeId('contact'),
              ...data,
              ownerId: actorId(),
              createdAt: now(),
              updatedAt: now(),
            };
            await db.contacts.add(contact);
            await db.activities.add(
              logActivity('created', `Added contact ${contact.firstName} ${contact.lastName}`, {
                companyId: contact.companyId,
                contactId: contact.id,
              })
            );
            return contact;
          })
        );
      },
      async update(id: string, input: ContactInput): Promise<void> {
        session.assert(CAPABILITIES.contactsWrite);
        const data = parse(ContactInputSchema, input);
        await environment.run('contacts.update', () =>
          db.contacts.update(id, { ...data, updatedAt: now() })
        );
      },
      async remove(id: string): Promise<void> {
        session.assert(CAPABILITIES.contactsDelete);
        await environment.run('contacts.delete', () =>
          db.transaction('rw', db.contacts, db.deals, async () => {
            // Deals keep existing; they just lose their primary contact.
            await db.deals.where('contactId').equals(id).modify({ contactId: null });
            await db.contacts.delete(id);
          })
        );
      },
    },

    deals: {
      async create(input: DealInput): Promise<Deal> {
        session.assert(CAPABILITIES.dealsCreate);
        const data = parse(DealInputSchema, input);
        return environment.run('deals.create', () =>
          db.transaction('rw', db.companies, db.deals, db.activities, async () => {
            if (!(await db.companies.get(data.companyId))) {
              throw new ValidationError({ companyId: 'That company no longer exists' });
            }
            const deal: Deal = {
              id: createRuntimeId('deal'),
              title: data.title,
              companyId: data.companyId,
              contactId: data.contactId,
              ownerId: data.ownerId ?? actorId(),
              stage: data.stage,
              amount: Math.round(data.amount),
              currency: 'USD',
              probability: STAGE_PROBABILITY[data.stage],
              closeDate: new Date(data.closeDate).toISOString(),
              lostReason: null,
              createdAt: now(),
              updatedAt: now(),
            };
            await db.deals.add(deal);
            await db.activities.add(
              logActivity('created', `Opened deal “${deal.title}”`, {
                dealId: deal.id,
                companyId: deal.companyId,
              })
            );
            return deal;
          })
        );
      },
      async update(id: string, input: DealInput): Promise<void> {
        const existing = await db.deals.get(id);
        if (!existing) throw new Error('Deal not found');
        session.assert(CAPABILITIES.dealsUpdate, existing);
        const data = parse(DealInputSchema, input);
        await environment.run('deals.update', () =>
          db.transaction('rw', db.deals, db.activities, async () => {
            await db.deals.update(id, {
              title: data.title,
              companyId: data.companyId,
              contactId: data.contactId,
              ownerId: data.ownerId ?? existing.ownerId,
              amount: Math.round(data.amount),
              closeDate: new Date(data.closeDate).toISOString(),
              updatedAt: now(),
            });
            if (data.stage !== existing.stage) {
              await db.deals.update(id, {
                stage: data.stage,
                probability: STAGE_PROBABILITY[data.stage],
              });
              await db.activities.add(
                logActivity(
                  'stage-change',
                  `Moved from ${STAGE_LABELS[existing.stage]} to ${STAGE_LABELS[data.stage]}`,
                  { dealId: id, companyId: existing.companyId }
                )
              );
            }
          })
        );
      },
      /** Pipeline drag/move: stage + probability + activity in one transaction. */
      async moveStage(id: string, stage: DealStage, lostReason?: string): Promise<void> {
        const existing = await db.deals.get(id);
        if (!existing) throw new Error('Deal not found');
        session.assert(CAPABILITIES.dealsUpdate, existing);
        if (existing.stage === stage) return;
        await environment.run('deals.move', () =>
          db.transaction('rw', db.deals, db.activities, async () => {
            await db.deals.update(id, {
              stage,
              probability: STAGE_PROBABILITY[stage],
              lostReason: stage === 'lost' ? lostReason?.trim() || 'No reason given' : null,
              updatedAt: now(),
            });
            await db.activities.add(
              logActivity(
                'stage-change',
                `Moved from ${STAGE_LABELS[existing.stage]} to ${STAGE_LABELS[stage]}`,
                { dealId: id, companyId: existing.companyId }
              )
            );
          })
        );
      },
      async remove(id: string): Promise<void> {
        const existing = await db.deals.get(id);
        if (!existing) return;
        session.assert(CAPABILITIES.dealsDelete, existing);
        await environment.run('deals.delete', () =>
          db.transaction('rw', db.deals, db.activities, async () => {
            await db.activities.where('dealId').equals(id).delete();
            await db.deals.delete(id);
          })
        );
      },
    },

    activities: {
      async log(
        type: Exclude<ActivityType, 'created' | 'stage-change'>,
        body: string,
        refs: Partial<Pick<Activity, 'dealId' | 'companyId' | 'contactId'>>
      ): Promise<Activity> {
        session.assert(CAPABILITIES.activitiesCreate);
        const text = body.trim();
        if (text.length < 2) throw new ValidationError({ body: 'Write at least 2 characters' });
        if (text.length > 2000)
          throw new ValidationError({ body: 'Keep it under 2,000 characters' });
        return environment.run('activities.create', async () => {
          const activity = logActivity(type, text, refs);
          await db.activities.add(activity);
          return activity;
        });
      },
    },
  };
}

export type CrmServices = ReturnType<typeof createCrmServices>;
