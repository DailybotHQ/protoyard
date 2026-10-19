import {
  type GenerateContext,
  type Membership,
  MS_PER_DAY,
  type Organization,
  type Persona,
  type Row,
  type WorldSeed,
} from '@protoyard/core';
import { createAvatarPool } from '@protoyard/scenarios';
import type {
  Account,
  AccountStatus,
  Beneficiary,
  Category,
  Transaction,
} from '../database/schema.ts';
import type { BankGeneratorOptions } from './index.ts';

/**
 * Builds a fictional household ledger. Transactions are generated FIRST and
 * balances are DERIVED from them, so `balance == sum(posted transactions)`
 * holds for every account in every scenario.
 */

/** v2: the household and the person payees carry library avatars (`av-NNN`). */
export const BANK_GENERATOR_VERSION = 2;

const PEOPLE = [
  {
    id: 'user_0001',
    name: 'Alex Rivera',
    role: 'owner',
    title: 'Primary holder',
    color: '#059669',
  },
  {
    id: 'user_0002',
    name: 'Jordan Rivera',
    role: 'member',
    title: 'Joint holder',
    color: '#2563eb',
  },
  { id: 'user_0003', name: 'Sam Rivera', role: 'viewer', title: 'Dependent', color: '#d97706' },
] as const;

export const MERCHANTS: Record<Exclude<Category, 'salary' | 'transfer' | 'rent'>, string[]> = {
  groceries: ['Greenleaf Market', 'Corner Pantry', 'FreshFold Grocers'],
  dining: ['Ember & Oak', 'Noodle Theory', 'Café Lumière', 'Taco Atlas'],
  transport: ['MetroLine Transit', 'Pedal Share', 'QuickRide'],
  shopping: ['Northstar Goods', 'Paper & Pine', 'Volt Electronics'],
  utilities: ['Brightwire Energy', 'Clearstream Water', 'Orbit Mobile'],
  entertainment: ['Streamly', 'Cinema Nova', 'Arcadia Games'],
  health: ['Wellspring Pharmacy', 'Pulse Fitness'],
};

export function generateBankWorld(ctx: GenerateContext): WorldSeed {
  const { scenario, rng, ids, time } = ctx;
  const opts = (scenario.generators.bank ?? {
    months: 6,
    openingCents: 400_000,
  }) as BankGeneratorOptions;
  const iso = (d: Date) => d.toISOString();
  const now = time.now;
  const ageDays = scenario.organization.ageDays;
  const opened = time.daysAgo(ageDays);

  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Rivera household',
    type: 'household',
    plan: scenario.organization.subscription,
    billingStatus: 'none',
    createdAt: iso(opened),
    size: scenario.organization.size,
    featureFlags: { instantTransfers: true, ...scenario.organization.featureFlags },
  };

  // Faces come from their own forks, so they shift no other seeded value.
  const householdAvatars = createAvatarPool(rng.fork('mobile-banking-demo:avatars:household'));
  const personas: Persona[] = [];
  const memberships: Membership[] = [];
  PEOPLE.forEach((person, index) => {
    if (index >= scenario.organization.size && person.id !== scenario.actor.id) return;
    const isActor = person.id === scenario.actor.id;
    const joined = isActor ? time.daysAgo(Math.min(scenario.actor.joinedDaysAgo, ageDays)) : opened;
    personas.push({
      id: person.id,
      name: person.name,
      email: `${person.name.split(' ')[0]?.toLowerCase()}@rivera.example`,
      avatarColor: person.color,
      avatar: householdAvatars.next(),
      title: person.title,
      locale: 'en-US',
      timezone: 'America/Bogota',
      joinedAt: iso(joined),
      onboardingComplete: isActor ? scenario.actor.onboardingComplete : true,
      preferences: {},
      summary: person.title,
    });
    memberships.push({
      id: `member_${person.id}`,
      personaId: person.id,
      organizationId: organization.id,
      role: isActor ? scenario.actor.role : person.role,
      joinedAt: iso(joined),
      capabilities: [],
    });
  });

  const status: AccountStatus = opts.status ?? 'active';
  const digits = () => String(rng.int(1000, 9999));
  const accounts: Account[] = [
    {
      id: 'acct_checking',
      ownerId: 'user_0001',
      name: 'Everyday Checking',
      type: 'checking',
      masked: `•••• ${digits()}`,
      balanceCents: 0,
      currency: 'USD',
      status,
      dailyLimitCents: 500_000,
      openedAt: iso(opened),
    },
  ];
  if (opts.months > 0) {
    accounts.push(
      {
        id: 'acct_savings',
        ownerId: 'user_0001',
        name: 'Rainy-day Savings',
        type: 'savings',
        masked: `•••• ${digits()}`,
        balanceCents: 0,
        currency: 'USD',
        status,
        dailyLimitCents: 1_000_000,
        openedAt: iso(opened),
      },
      {
        id: 'acct_credit',
        ownerId: 'user_0001',
        name: 'Lumen Card',
        type: 'credit',
        masked: `•••• ${digits()}`,
        balanceCents: 0,
        currency: 'USD',
        status,
        dailyLimitCents: 300_000,
        openedAt: iso(opened),
      }
    );
  }

  const transactions: Transaction[] = [];
  const add = (
    accountId: string,
    amountCents: number,
    category: Category,
    merchant: string,
    at: Date,
    description?: string
  ) =>
    transactions.push({
      id: ids.next('txn'),
      accountId,
      amountCents,
      description: description ?? merchant,
      merchant,
      category,
      status: 'posted',
      transferId: null,
      at: iso(at),
    });

  if (opts.openingCents > 0)
    add('acct_checking', opts.openingCents, 'transfer', 'Opening deposit', opened);

  // Dormant accounts stopped moving 120 days ago.
  const lastActivity = scenario.activity.level === 'dormant' ? time.daysAgo(120) : now;
  const days = Math.min(opts.months * 30, ageDays);
  for (let d = days; d >= 1; d--) {
    const day = time.daysAgo(d);
    if (day > lastActivity) break;
    const at = (h: number) => new Date(day.getTime() + h * 3_600_000);
    const dom = day.getUTCDate();
    if (dom === 1 || dom === 15)
      add(
        'acct_checking',
        285_000,
        'salary',
        'Brightpath Studio payroll',
        at(9),
        'Payroll deposit'
      );
    if (dom === 3) add('acct_checking', -180_000, 'rent', 'Maple Court Apartments', at(8), 'Rent');
    if (dom === 5) {
      add('acct_checking', -40_000, 'transfer', 'Rainy-day Savings', at(10), 'Auto-save');
      add('acct_savings', 40_000, 'transfer', 'Everyday Checking', at(10), 'Auto-save');
    }
    if (dom === 20) {
      add(
        'acct_checking',
        -rng.int(6, 14) * 1000,
        'utilities',
        rng.pick(MERCHANTS.utilities),
        at(7)
      );
    }
    for (let n = 0, count = rng.int(0, 3); n < count; n++) {
      const category = rng.weighted<keyof typeof MERCHANTS>([
        ['groceries', 4],
        ['dining', 3],
        ['transport', 3],
        ['shopping', 2],
        ['entertainment', 1],
        ['health', 1],
      ]);
      const onCard = rng.chance(0.45) && accounts.some((a) => a.id === 'acct_credit');
      const amount = -rng.int(4, category === 'shopping' ? 180 : 70) * 100 - rng.int(0, 99);
      add(
        onCard ? 'acct_credit' : 'acct_checking',
        amount,
        category,
        rng.pick(MERCHANTS[category]),
        at(rng.int(8, 21))
      );
    }
  }

  if (opts.lowBalance) {
    // Move nearly everything to savings, leaving a few dollars in checking.
    const checking = transactions
      .filter((t) => t.accountId === 'acct_checking')
      .reduce((s, t) => s + t.amountCents, 0);
    const keep = 2_350;
    if (checking > keep) {
      const at = time.hoursAgo(20);
      add(
        'acct_checking',
        -(checking - keep),
        'transfer',
        'Rainy-day Savings',
        at,
        'Moved to savings'
      );
      add(
        'acct_savings',
        checking - keep,
        'transfer',
        'Everyday Checking',
        at,
        'Moved from checking'
      );
    }
  }

  // Pending card authorisations in the last 2 days (not part of the balance).
  if (scenario.activity.level !== 'dormant' && accounts.some((a) => a.id === 'acct_credit')) {
    for (let p = 0; p < 2; p++) {
      transactions.push({
        id: ids.next('txn'),
        accountId: 'acct_credit',
        amountCents: -rng.int(8, 60) * 100,
        description: 'Card authorisation',
        merchant: rng.pick(MERCHANTS.dining),
        category: 'dining',
        status: 'pending',
        transferId: null,
        at: iso(time.hoursAgo(rng.int(2, 40))),
      });
    }
  }

  for (const account of accounts) {
    account.balanceCents = transactions
      .filter((t) => t.accountId === account.id && t.status === 'posted')
      .reduce((s, t) => s + t.amountCents, 0);
  }

  // People get a face the household does not use; the landlord (a business) gets none.
  const payeeAvatars = createAvatarPool(rng.fork('mobile-banking-demo:avatars:payees'), {
    avoid: personas.map((p) => p.avatar),
  });
  const beneficiaries: Beneficiary[] =
    opts.months > 0
      ? (
          [
            ['Casey Morgan', 'Casey', 'Harborline Credit Union', true],
            ['Maple Court Apartments', 'Landlord', 'Northgate Savings', false],
            ['Riley Chen', 'Riley', 'Summit Mutual', true],
          ] as const
        ).map(([name, nickname, institution, person]) => ({
          id: ids.next('payee'),
          ownerId: 'user_0001',
          name,
          nickname,
          institution,
          masked: `•••• ${digits()}`,
          ...(person ? { avatar: payeeAvatars.next() } : {}),
          createdAt: iso(between(opened, now, rng.next())),
        }))
      : [];

  transactions.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  return {
    organizations: [organization],
    personas,
    memberships,
    tables: {
      accounts: accounts as unknown as Row[],
      transactions: transactions as unknown as Row[],
      beneficiaries: beneficiaries as unknown as Row[],
      transfers: [],
    },
  };
}

function between(from: Date, to: Date, roll: number): Date {
  return new Date(from.getTime() + roll * Math.max(0, to.getTime() - from.getTime()));
}

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / MS_PER_DAY);
