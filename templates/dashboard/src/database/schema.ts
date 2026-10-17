import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable, Transaction } from 'dexie';

/**
 * Domain tables in Dexie store syntax: the first key is the primary key, the
 * rest are indexes. To add a table, add a NEW version (never edit an old
 * one), bump `storage.schemaVersion` in protoyard.json, and add the typed
 * table to `DashboardDatabase` below.
 *
 * Relationships: customer 1─* order; event → customer | order (both optional).
 * `ownerId`, `actorId` and `updatedBy` reference personas in `py_personas`.
 *
 * Rows are type aliases (not interfaces) so they stay assignable to the
 * generic `Row` the generator returns.
 */

export const CUSTOMER_STATUSES = ['trial', 'active', 'paused', 'churned'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const PLANS = ['starter', 'growth', 'enterprise'] as const;
export type Plan = (typeof PLANS)[number];

export const ORDER_STATUSES = ['pending', 'paid', 'fulfilled', 'refunded', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Orders in these states count as revenue. */
export const REVENUE_STATUSES: readonly OrderStatus[] = ['paid', 'fulfilled'];

export const CURRENCIES = ['USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

export type Customer = {
  id: string;
  name: string;
  email: string;
  company: string;
  plan: Plan;
  status: CustomerStatus;
  country: string;
  /** Persona id (`py_personas`) of the account owner on our side. */
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type Order = {
  id: string;
  /** Human-facing number, e.g. `ORD-1042`. */
  reference: string;
  customerId: string;
  description: string;
  /** Integer cents (AGENTS rule 7): format at display time with `money()`. */
  amountCents: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
};

export type EventType =
  | 'customer.created'
  | 'customer.updated'
  | 'customer.deleted'
  | 'order.created'
  | 'order.status_changed'
  | 'settings.updated';

/** Append-only audit trail written in the same transaction as the change it describes. */
export type AppEvent = {
  id: string;
  type: EventType;
  message: string;
  customerId: string | null;
  orderId: string | null;
  actorId: string;
  at: string;
};

/** A single row (`id: 'workspace'`) holding workspace-wide settings. */
export type WorkspaceSettings = {
  id: 'workspace';
  workspaceName: string;
  supportEmail: string;
  currency: Currency;
  weeklyReport: boolean;
  updatedAt: string;
  updatedBy: string;
};

export type DashboardDatabase = Dexie & {
  customers: EntityTable<Customer, 'id'>;
  orders: EntityTable<Order, 'id'>;
  events: EntityTable<AppEvent, 'id'>;
  settings: EntityTable<WorkspaceSettings, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        customers: 'id, name, status, plan, ownerId, createdAt',
        orders: 'id, reference, customerId, status, createdAt',
        events: 'id, type, customerId, orderId, actorId, at',
        settings: 'id',
      },
    },
    {
      // v2: money as integer cents. Existing rows convert in place; no data is lost.
      version: 2,
      stores: {},
      upgrade: async (tx) => {
        await (tx as Transaction)
          .table('orders')
          .toCollection()
          .modify((order: Record<string, unknown>) => {
            if (typeof order.amount === 'number') {
              order.amountCents = Math.round(order.amount * 100);
              delete order.amount;
            }
          });
      },
    },
  ],
};
