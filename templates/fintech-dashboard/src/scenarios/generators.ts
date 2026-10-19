import type {
  GenerateContext,
  Membership,
  Organization,
  Persona,
  WorldSeed,
} from '@protoyard/core';
import { timeSeries } from '@protoyard/scenarios';
import type { Account, BalanceSnapshot, Budget, Transaction } from '../database/schema.ts';

const PEOPLE = [
  { id: 'user_0001', name: 'Jordan Lee', title: 'Account owner', role: 'owner' },
  { id: 'user_0002', name: 'Morgan Diaz', title: 'Household member', role: 'member' },
  { id: 'user_0003', name: 'Riley Chen', title: 'Read-only accountant', role: 'viewer' },
] as const;
const EXPENSES = ['Housing', 'Groceries', 'Transport', 'Dining', 'Utilities'] as const;
const REFERENCE_TIME = '2026-10-19T13:00:00.000Z';

export function generateFintechWorld(ctx: GenerateContext): WorldSeed {
  const { scenario, ids, time, rng } = ctx;
  const actor = scenario.actor;
  const organizationAgeDays = scenario.id === 'empty' ? 0 : 180;
  const organization: Organization = {
    id: 'org_0001',
    name: 'Northstar Household',
    type: 'household',
    plan: 'standard',
    billingStatus: 'none',
    featureFlags: {},
    createdAt: time.daysAgo(organizationAgeDays).toISOString(),
    size: PEOPLE.length,
  };
  const personas: Persona[] = PEOPLE.map((person, index) => {
    const joinedDaysAgo = organizationAgeDays ? 120 - index * 25 : 0;
    const joinedAt = time.daysAgo(joinedDaysAgo).toISOString();
    const role = person.id === actor.id ? actor.role : person.role;
    return {
      id: person.id,
      name: person.name,
      email: `${person.name.split(' ')[0]?.toLowerCase()}@example.com`,
      title: person.title,
      avatarColor: ['#4263eb', '#2b8a3e', '#9c36b5'][index] ?? '#4263eb',
      locale: 'en-US',
      timezone: 'UTC',
      joinedAt,
      onboardingComplete: true,
      preferences: {},
      summary: `${person.title} · ${role}`,
    };
  });
  const memberships: Membership[] = PEOPLE.map((person, index) => ({
    id: `membership_${String(index + 1).padStart(4, '0')}`,
    personaId: person.id,
    organizationId: organization.id,
    role: person.id === actor.id ? actor.role : person.role,
    joinedAt: personas[index]?.joinedAt ?? time.daysAgo(30).toISOString(),
    capabilities: [],
  }));

  const active = scenario.id !== 'empty';
  const rawHistoryDays = Number(
    (scenario.generators?.fintech as { historyDays?: number } | undefined)?.historyDays ?? 90
  );
  const historyDays =
    active && Number.isInteger(rawHistoryDays) ? Math.max(0, Math.min(365, rawHistoryDays)) : 0;
  const end = Date.parse(scenario.referenceTime || REFERENCE_TIME);
  const start = end - Math.max(0, historyDays - 1) * 86_400_000;
  const paydays = Array.from({ length: Math.ceil(historyDays / 14) }, (_, index) => ({
    at: new Date(start + (index * 14 + 7) * 86_400_000),
    factor: 1.18,
    decayDays: 2.5,
  }));
  const balancePoints =
    historyDays > 0
      ? timeSeries({
          ctx: { scenario },
          key: 'checking-balance-payday-cycle',
          days: historyDays,
          to: new Date(end),
          base: 5_200_000,
          trend: 'growth',
          seasonality: 'weekly+annual',
          noise: 0.025,
          min: 3_000_000,
          spikes: paydays,
        })
      : [];
  const openingBalanceCents = balancePoints[0]?.value ?? 0;
  const balanceCents = balancePoints.at(-1)?.value ?? 0;
  const accountCreatedAt = time.daysAgo(organizationAgeDays).toISOString();
  const accounts: Account[] = [
    {
      id: 'account-checking',
      name: 'Everyday checking',
      type: 'checking',
      currency: 'USD',
      openingBalanceCents,
      balanceCents,
      ownerId: 'user_0001',
      createdAt: accountCreatedAt,
    },
    {
      id: 'account-savings',
      name: 'Rainy day savings',
      type: 'savings',
      currency: 'USD',
      openingBalanceCents: 1_450_000,
      balanceCents: 1_450_000,
      ownerId: 'user_0001',
      createdAt: accountCreatedAt,
    },
  ];

  const transactions: Transaction[] = [];
  const balanceSnapshots: BalanceSnapshot[] = [];
  for (let index = 0; index < balancePoints.length; index++) {
    const point = balancePoints[index];
    if (!point) continue;
    const atMs = Date.parse(point.at);
    balanceSnapshots.push({
      id: `account-checking:${point.at.slice(0, 10)}`,
      accountId: 'account-checking',
      at: new Date(Date.parse(point.at) + 12 * 60 * 60 * 1000).toISOString(),
      balanceCents: point.value,
    });
    if (index === 0) continue;
    const previous = balancePoints[index - 1]?.value ?? point.value;
    const delta = point.value - previous;
    if (delta === 0) continue;
    const payday = paydays.some(
      (spike) => spike.at.toISOString().slice(0, 10) === point.at.slice(0, 10)
    );
    const income = delta > 0;
    const category = income ? (payday ? 'Payroll' : 'Refunds') : (rng.pick(EXPENSES) as string);
    transactions.push({
      id: ids.next('transaction'),
      accountId: 'account-checking',
      relatedAccountId: null,
      type: income ? 'income' : 'expense',
      direction: null,
      category,
      description: income
        ? payday
          ? 'Northstar payroll deposit'
          : 'Merchant refund'
        : `${category} payment`,
      amountCents: Math.abs(delta),
      occurredAt: new Date(atMs + 6 * 60 * 60 * 1000).toISOString(),
    });
  }

  const referenceMonth = (scenario.referenceTime || REFERENCE_TIME).slice(0, 7);
  const monthSpend = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.type === 'expense' && transaction.occurredAt.slice(0, 7) === referenceMonth) {
      monthSpend.set(
        transaction.category,
        (monthSpend.get(transaction.category) ?? 0) + transaction.amountCents
      );
    }
  }
  const budgets: Budget[] = EXPENSES.map((category) => {
    const spent = monthSpend.get(category) ?? 0;
    const limitCents = Math.max(125_000, Math.floor(spent * 0.92));
    return {
      id: `budget-${category.toLowerCase()}`,
      category,
      limitCents,
      alertAtCents:
        spent > 0
          ? Math.max(1, Math.min(Math.floor(limitCents * 0.8), Math.floor(spent * 0.8)))
          : Math.floor(limitCents * 0.8),
      period: 'monthly',
    };
  });

  return {
    organizations: [organization],
    personas,
    memberships,
    tables: { accounts, transactions, budgets, balanceSnapshots },
  };
}
