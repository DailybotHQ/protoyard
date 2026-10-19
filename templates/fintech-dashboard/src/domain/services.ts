import {
  createRuntimeId,
  type PrototypeRuntime,
  parseInput,
  ValidationError,
} from '@protoyard/core';
import { z } from 'zod';
import type { FintechDatabase, Transaction } from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';

const TransferInput = z.object({
  fromAccountId: z.string().trim().min(1).max(100),
  toAccountId: z.string().trim().min(1).max(100),
  amountCents: z.number().int().positive().max(1_000_000_000),
  memo: z.string().trim().min(2).max(120),
});
export type TransferInput = z.input<typeof TransferInput>;

export class InsufficientFundsError extends Error {
  constructor() {
    super('The source account does not have enough available funds for this transfer.');
    this.name = 'InsufficientFundsError';
  }
}

export function createFintechServices(runtime: PrototypeRuntime<FintechDatabase>) {
  const { db, session, environment, clock } = runtime;

  return {
    transfers: {
      async create(input: TransferInput): Promise<Transaction[]> {
        session.assert(CAPABILITIES.transfersCreate);
        const data = parseInput(TransferInput, input);
        if (data.fromAccountId === data.toAccountId) {
          throw new ValidationError({ toAccountId: 'Choose a different destination account.' });
        }
        return environment.run('transfers.create', () =>
          db.transaction('rw', db.accounts, db.transactions, db.balanceSnapshots, async () => {
            const source = await db.accounts.get(data.fromAccountId);
            const destination = await db.accounts.get(data.toAccountId);
            if (!source || !destination) {
              throw new ValidationError({ fromAccountId: 'Both accounts must be available.' });
            }
            if (source.balanceCents < data.amountCents) throw new InsufficientFundsError();

            const at = clock.now().toISOString();
            const sourceRow: Transaction = {
              id: createRuntimeId('transaction'),
              accountId: source.id,
              relatedAccountId: destination.id,
              type: 'transfer',
              direction: 'out',
              category: 'Transfer',
              description: data.memo,
              amountCents: data.amountCents,
              occurredAt: at,
            };
            const destinationRow: Transaction = {
              ...sourceRow,
              id: createRuntimeId('transaction'),
              accountId: destination.id,
              relatedAccountId: source.id,
              direction: 'in',
            };
            const nextSource = source.balanceCents - data.amountCents;
            const nextDestination = destination.balanceCents + data.amountCents;
            await db.accounts.bulkPut([
              { ...source, balanceCents: nextSource },
              { ...destination, balanceCents: nextDestination },
            ]);
            await db.transactions.bulkAdd([sourceRow, destinationRow]);
            const day = at.slice(0, 10);
            await db.balanceSnapshots.bulkPut([
              { id: `${source.id}:${day}`, accountId: source.id, at, balanceCents: nextSource },
              {
                id: `${destination.id}:${day}`,
                accountId: destination.id,
                at,
                balanceCents: nextDestination,
              },
            ]);
            return [sourceRow, destinationRow];
          })
        );
      },
    },
  };
}
