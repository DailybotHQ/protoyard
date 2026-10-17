import { createRuntimeId, type PrototypeRuntime } from '@protoyard/core';
import { z } from 'zod';
import type {
  Account,
  BankDatabase,
  Beneficiary,
  Transaction,
  Transfer,
} from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';

/**
 * Banking services. A transfer is ONE Dexie transaction that writes the
 * transfer record, the debit (and credit, for internal moves) ledger rows and
 * both balances — so a failure anywhere leaves every balance untouched.
 */

export type TransferErrorCode =
  | 'insufficient-funds'
  | 'account-locked'
  | 'account-dormant'
  | 'over-limit'
  | 'same-account'
  | 'not-found'
  | 'invalid';

export class TransferError extends Error {
  readonly code: TransferErrorCode;
  constructor(code: TransferErrorCode, message: string) {
    super(message);
    this.name = 'TransferError';
    this.code = code;
  }
}

export const TransferInputSchema = z
  .object({
    fromAccountId: z.string().min(1, 'Choose an account to send from'),
    toAccountId: z.string().nullable().default(null),
    beneficiaryId: z.string().nullable().default(null),
    amount: z.coerce
      .number({ error: 'Enter an amount' })
      .positive('Amount must be greater than zero')
      .max(1_000_000, 'That is above any demo limit'),
    memo: z.string().trim().max(80).default(''),
  })
  .refine((v) => Boolean(v.toAccountId) !== Boolean(v.beneficiaryId), {
    message: 'Choose exactly one recipient',
    path: ['toAccountId'],
  });
export type TransferInput = z.input<typeof TransferInputSchema>;

export const BeneficiaryInputSchema = z.object({
  name: z.string().trim().min(2, 'Enter the recipient name').max(60),
  nickname: z.string().trim().max(24).default(''),
  institution: z.string().trim().min(2, 'Enter a (fictional) bank name').max(40),
  last4: z.string().regex(/^\d{4}$/, 'Use the last 4 digits only (demo)'),
});
export type BeneficiaryInput = z.input<typeof BeneficiaryInputSchema>;

export function createBankServices(runtime: PrototypeRuntime<BankDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  const me = () => {
    const principal = session.principal();
    if (!principal) throw new Error('No active persona');
    return principal.persona.id;
  };

  const usable = (account: Account | undefined, label: string): Account => {
    if (!account) throw new TransferError('not-found', `${label} account not found.`);
    if (account.status === 'locked') {
      throw new TransferError(
        'account-locked',
        `${account.name} is locked. Unlock it to move money.`
      );
    }
    if (account.status === 'dormant') {
      throw new TransferError(
        'account-dormant',
        `${account.name} is dormant. Reactivate it first.`
      );
    }
    return account;
  };

  return {
    async transfer(input: TransferInput): Promise<Transfer> {
      const parsed = TransferInputSchema.safeParse(input);
      if (!parsed.success) {
        throw new TransferError('invalid', parsed.error.issues[0]?.message ?? 'Invalid transfer');
      }
      const data = parsed.data;
      const amountCents = Math.round(data.amount * 100);
      session.assert(CAPABILITIES.transfersCreate, { amountCents });
      if (data.toAccountId === data.fromAccountId) {
        throw new TransferError('same-account', 'Choose a different account to send to.');
      }

      return environment.run('transfers.create', () =>
        db.transaction(
          'rw',
          db.accounts,
          db.transactions,
          db.transfers,
          db.beneficiaries,
          async () => {
            const from = usable(await db.accounts.get(data.fromAccountId), 'Source');
            const to = data.toAccountId
              ? usable(await db.accounts.get(data.toAccountId), 'Destination')
              : null;
            const beneficiary = data.beneficiaryId
              ? await db.beneficiaries.get(data.beneficiaryId)
              : null;
            if (data.beneficiaryId && !beneficiary) {
              throw new TransferError('not-found', 'That recipient no longer exists.');
            }
            if (amountCents > from.dailyLimitCents) {
              throw new TransferError(
                'over-limit',
                `Transfers from ${from.name} are limited to ${(from.dailyLimitCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}.`
              );
            }
            // Credit lines may go negative down to their limit; deposits may not.
            const floor = from.type === 'credit' ? -from.dailyLimitCents * 10 : 0;
            if (from.balanceCents - amountCents < floor) {
              throw new TransferError('insufficient-funds', `Not enough funds in ${from.name}.`);
            }

            const at = now();
            const transfer: Transfer = {
              id: createRuntimeId('transfer'),
              fromAccountId: from.id,
              toAccountId: to?.id ?? null,
              beneficiaryId: beneficiary?.id ?? null,
              amountCents,
              memo: data.memo,
              status: 'completed',
              createdBy: me(),
              at,
            };
            const recipient = to?.name ?? beneficiary?.nickname ?? beneficiary?.name ?? 'recipient';
            const debit: Transaction = {
              id: createRuntimeId('txn'),
              accountId: from.id,
              amountCents: -amountCents,
              description: data.memo || `Transfer to ${recipient}`,
              merchant: recipient,
              category: 'transfer',
              status: 'posted',
              transferId: transfer.id,
              at,
            };
            await db.transfers.add(transfer);
            await db.transactions.add(debit);
            await db.accounts.update(from.id, { balanceCents: from.balanceCents - amountCents });
            if (to) {
              await db.transactions.add({
                ...debit,
                id: createRuntimeId('txn'),
                accountId: to.id,
                amountCents,
                description: data.memo || `Transfer from ${from.name}`,
                merchant: from.name,
              });
              await db.accounts.update(to.id, { balanceCents: to.balanceCents + amountCents });
            }
            return transfer;
          }
        )
      );
    },

    async addBeneficiary(input: BeneficiaryInput): Promise<Beneficiary> {
      session.assert(CAPABILITIES.beneficiariesManage);
      const parsed = BeneficiaryInputSchema.safeParse(input);
      if (!parsed.success)
        throw new TransferError('invalid', parsed.error.issues[0]?.message ?? 'Invalid');
      const data = parsed.data;
      return environment.run('beneficiaries.create', async () => {
        const beneficiary: Beneficiary = {
          id: createRuntimeId('payee'),
          ownerId: me(),
          name: data.name,
          nickname: data.nickname || data.name.split(' ')[0] || data.name,
          institution: data.institution,
          masked: `•••• ${data.last4}`,
          createdAt: now(),
        };
        await db.beneficiaries.add(beneficiary);
        return beneficiary;
      });
    },

    async removeBeneficiary(id: string): Promise<void> {
      session.assert(CAPABILITIES.beneficiariesManage);
      await environment.run('beneficiaries.delete', () => db.beneficiaries.delete(id));
    },

    /** "Freeze card" style toggle — owner only. */
    async setAccountStatus(id: string, status: 'active' | 'locked'): Promise<void> {
      session.assert(CAPABILITIES.accountsManage);
      await environment.run('accounts.status', () => db.accounts.update(id, { status }));
    },
  };
}

export type BankServices = ReturnType<typeof createBankServices>;

/** Ledger invariant used by tests and the DevTools data view. */
export async function ledgerIsBalanced(db: BankDatabase): Promise<boolean> {
  const accounts = await db.accounts.toArray();
  for (const account of accounts) {
    const rows = await db.transactions.where('accountId').equals(account.id).toArray();
    const sum = rows.filter((r) => r.status === 'posted').reduce((s, r) => s + r.amountCents, 0);
    if (sum !== account.balanceCents) return false;
  }
  return true;
}
