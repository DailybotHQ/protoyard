import { createRuntimeId, type PrototypeRuntime } from '@protoyard/core';
import type {
  AppEvent,
  Customer,
  DashboardDatabase,
  EventType,
  Order,
  OrderStatus,
  WorkspaceSettings,
} from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';
import {
  type CustomerInput,
  CustomerInputSchema,
  type OrderInput,
  OrderInputSchema,
  parse,
  type SettingsInput,
  SettingsInputSchema,
  ValidationError,
} from './validation.ts';

/**
 * Domain services: the ONLY way screens change data. Each mutation
 *   1. checks the simulated policy (`session.assert`) — enforced even if the UI is bypassed,
 *   2. validates input with zod (field errors come back as `ValidationError.issues`),
 *   3. runs through the simulated environment (latency / offline / failures),
 *   4. writes every related row in ONE Dexie transaction (change + audit event).
 * To add a service, follow the same four steps.
 */

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  fulfilled: 'Fulfilled',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

/** Allowed status changes. Refunded and cancelled orders are final. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['fulfilled', 'refunded'],
  fulfilled: ['refunded'],
  refunded: [],
  cancelled: [],
};

export class TransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`An order can't move from ${ORDER_STATUS_LABELS[from]} to ${ORDER_STATUS_LABELS[to]}.`);
    this.name = 'TransitionError';
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`This ${what} no longer exists. It may have been deleted in another tab.`);
    this.name = 'NotFoundError';
  }
}

export function createServices(runtime: PrototypeRuntime<DashboardDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  const actorId = () => {
    const principal = session.principal();
    if (!principal) throw new Error('No active persona. Load a scenario first.');
    return principal.persona.id;
  };
  const event = (
    type: EventType,
    message: string,
    refs: { customerId?: string | null; orderId?: string | null } = {}
  ): AppEvent => ({
    id: createRuntimeId('event'),
    type,
    message,
    customerId: refs.customerId ?? null,
    orderId: refs.orderId ?? null,
    actorId: actorId(),
    at: now(),
  });

  /** Next free `ORD-####` number; read inside the write transaction so two creates never collide. */
  const nextReference = async () => {
    // References share one width (ORD-1001…ORD-9999), so the index sorts them numerically.
    const last = await db.orders.orderBy('reference').last();
    const max = Math.max(1000, Number(last?.reference.slice(4)) || 0);
    return `ORD-${max + 1}`;
  };

  return {
    customers: {
      async create(input: CustomerInput): Promise<Customer> {
        session.assert(CAPABILITIES.customersCreate);
        const data = parse(CustomerInputSchema, input);
        return environment.run('customers.create', () =>
          db.transaction('rw', db.customers, db.events, async () => {
            const at = now();
            const customer: Customer = {
              id: createRuntimeId('customer'),
              ...data,
              ownerId: actorId(),
              createdAt: at,
              updatedAt: at,
            };
            await db.customers.add(customer);
            await db.events.add(
              event('customer.created', `Added customer ${customer.name}`, {
                customerId: customer.id,
              })
            );
            return customer;
          })
        );
      },

      async update(id: string, input: CustomerInput): Promise<void> {
        session.assert(CAPABILITIES.customersUpdate);
        const data = parse(CustomerInputSchema, input);
        await environment.run('customers.update', () =>
          db.transaction('rw', db.customers, db.events, async () => {
            const existing = await db.customers.get(id);
            if (!existing) throw new NotFoundError('customer');
            await db.customers.update(id, { ...data, updatedAt: now() });
            const changes =
              existing.status !== data.status
                ? ` (status ${existing.status} → ${data.status})`
                : '';
            await db.events.add(
              event('customer.updated', `Updated ${data.name}${changes}`, { customerId: id })
            );
          })
        );
      },

      /** Removes the customer, its orders and their history in one transaction. */
      async remove(id: string): Promise<void> {
        session.assert(CAPABILITIES.customersDelete);
        await environment.run('customers.delete', () =>
          db.transaction('rw', db.customers, db.orders, db.events, async () => {
            const existing = await db.customers.get(id);
            if (!existing) return;
            const orderIds = await db.orders.where('customerId').equals(id).primaryKeys();
            await db.events.where('customerId').equals(id).delete();
            await db.events.where('orderId').anyOf(orderIds).delete();
            await db.orders.where('customerId').equals(id).delete();
            await db.customers.delete(id);
            // Keep a trace without dangling references.
            await db.events.add(
              event(
                'customer.deleted',
                `Deleted customer ${existing.name} and ${orderIds.length} order${orderIds.length === 1 ? '' : 's'}`
              )
            );
          })
        );
      },
    },

    orders: {
      async create(input: OrderInput): Promise<Order> {
        session.assert(CAPABILITIES.ordersCreate);
        const data = parse(OrderInputSchema, input);
        return environment.run('orders.create', () =>
          db.transaction('rw', db.customers, db.orders, db.events, async () => {
            const customer = await db.customers.get(data.customerId);
            if (!customer)
              throw new ValidationError({ customerId: 'That customer no longer exists' });
            const at = now();
            const order: Order = {
              id: createRuntimeId('order'),
              reference: await nextReference(),
              customerId: customer.id,
              description: data.description,
              amount: Math.round(data.amount * 100) / 100,
              status: 'pending',
              createdAt: at,
              updatedAt: at,
            };
            await db.orders.add(order);
            await db.events.add(
              event('order.created', `Created ${order.reference} for ${customer.name}`, {
                customerId: customer.id,
                orderId: order.id,
              })
            );
            return order;
          })
        );
      },

      /** Status change + audit event, atomically. Invalid transitions are rejected. */
      async setStatus(id: string, status: OrderStatus): Promise<void> {
        session.assert(CAPABILITIES.ordersUpdate);
        await environment.run('orders.status', () =>
          db.transaction('rw', db.orders, db.events, async () => {
            const order = await db.orders.get(id);
            if (!order) throw new NotFoundError('order');
            if (order.status === status) return;
            if (!ORDER_TRANSITIONS[order.status].includes(status)) {
              throw new TransitionError(order.status, status);
            }
            await db.orders.update(id, { status, updatedAt: now() });
            await db.events.add(
              event(
                'order.status_changed',
                `${order.reference}: ${ORDER_STATUS_LABELS[order.status]} → ${ORDER_STATUS_LABELS[status]}`,
                { customerId: order.customerId, orderId: id }
              )
            );
          })
        );
      },
    },

    settings: {
      async update(input: SettingsInput): Promise<WorkspaceSettings> {
        session.assert(CAPABILITIES.settingsManage);
        const data = parse(SettingsInputSchema, input);
        return environment.run('settings.update', () =>
          db.transaction('rw', db.settings, db.events, async () => {
            const settings: WorkspaceSettings = {
              id: 'workspace',
              ...data,
              updatedAt: now(),
              updatedBy: actorId(),
            };
            await db.settings.put(settings);
            await db.events.add(event('settings.updated', 'Updated workspace settings'));
            return settings;
          })
        );
      },
    },
  };
}

export type DashboardServices = ReturnType<typeof createServices>;
