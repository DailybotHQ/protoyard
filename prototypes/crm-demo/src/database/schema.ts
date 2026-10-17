import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable, Transaction } from 'dexie';

/**
 * Pipeline CRM data model. Every row has a stable string `id`; seeded ids are
 * deterministic (`deal_0007`), ids created in the UI carry a `u` marker.
 *
 * Relationships: company 1─* contact, company 1─* deal, deal *─1 contact
 * (optional), activity → deal | company | contact. `ownerId` and `actorId`
 * reference personas in the reserved `py_personas` table.
 */

export const DEAL_STAGES = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const OPEN_STAGES: readonly DealStage[] = ['lead', 'qualified', 'proposal', 'negotiation'];

/** Default win probability per stage (v2 migration backfills from this). */
export const STAGE_PROBABILITY: Record<DealStage, number> = {
  lead: 10,
  qualified: 25,
  proposal: 50,
  negotiation: 75,
  won: 100,
  lost: 0,
};

export const INDUSTRIES = [
  'Software',
  'Healthcare',
  'Logistics',
  'Education',
  'Retail',
  'Manufacturing',
  'Finance',
  'Media',
] as const;

export interface Company {
  id: string;
  name: string;
  industry: string;
  employees: number;
  domain: string;
  city: string;
  ownerId: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  title: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Deal {
  id: string;
  title: string;
  companyId: string;
  contactId: string | null;
  ownerId: string;
  stage: DealStage;
  amount: number;
  currency: 'USD';
  /** Added in schema v2 (backfilled from the stage). */
  probability: number;
  closeDate: string;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ActivityType = 'note' | 'call' | 'email' | 'meeting' | 'stage-change' | 'created';

export interface Activity {
  id: string;
  type: ActivityType;
  dealId: string | null;
  companyId: string | null;
  contactId: string | null;
  actorId: string;
  body: string;
  at: string;
}

export type CrmDatabase = Dexie & {
  companies: EntityTable<Company, 'id'>;
  contacts: EntityTable<Contact, 'id'>;
  deals: EntityTable<Deal, 'id'>;
  activities: EntityTable<Activity, 'id'>;
};

export const DOMAIN_TABLES = ['companies', 'contacts', 'deals', 'activities'] as const;

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        companies: 'id, name, industry, ownerId, createdAt',
        contacts: 'id, companyId, lastName, email, ownerId, createdAt',
        deals: 'id, companyId, contactId, ownerId, stage, closeDate, createdAt',
        activities: 'id, dealId, companyId, contactId, actorId, at',
      },
    },
    {
      // v2: deals gain a `probability` (indexed for forecast sorting) and
      // companies gain a multi-entry `tags` index. Existing rows are kept and
      // backfilled — nothing is deleted.
      version: 2,
      stores: {
        companies: 'id, name, industry, ownerId, createdAt, *tags',
        deals: 'id, companyId, contactId, ownerId, stage, probability, closeDate, createdAt',
      },
      upgrade: async (tx) => {
        const transaction = tx as Transaction;
        await transaction
          .table<Deal>('deals')
          .toCollection()
          .modify((deal) => {
            if (typeof deal.probability !== 'number') {
              deal.probability = STAGE_PROBABILITY[deal.stage] ?? 0;
            }
          });
        await transaction
          .table<Company>('companies')
          .toCollection()
          .modify((company) => {
            if (!Array.isArray(company.tags)) company.tags = [];
          });
      },
    },
  ],
};
