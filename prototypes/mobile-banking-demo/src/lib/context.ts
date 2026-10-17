import type { PrototypeRuntime } from '@protoyard/core';
import { getRuntime } from '@protoyard/renderer-svelte';
import { getContext, setContext } from 'svelte';
import type { BankDatabase } from '../database/schema.ts';
import { type BankServices, createBankServices } from '../domain/services.ts';
import { type BankSimulations, createBankSimulations } from './simulations.ts';

const KEY = Symbol('lumen-bank');

export interface Bank {
  runtime: PrototypeRuntime<BankDatabase>;
  db: BankDatabase;
  services: BankServices;
  simulations: BankSimulations;
}

export function createBank(runtime: PrototypeRuntime<BankDatabase>): Bank {
  return {
    runtime,
    db: runtime.db,
    services: createBankServices(runtime),
    simulations: createBankSimulations(runtime),
  };
}

/** Called once in App.svelte (or a test host); screens read it with `useBank()`. */
export function provideBank(runtime?: PrototypeRuntime<BankDatabase>): Bank {
  const bank = createBank(runtime ?? getRuntime<BankDatabase>());
  setContext(KEY, bank);
  return bank;
}

export function useBank(): Bank {
  const bank = getContext<Bank | undefined>(KEY);
  if (!bank) throw new Error('useBank() must be used inside App.svelte');
  return bank;
}
