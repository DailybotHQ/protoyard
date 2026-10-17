import {
  PermissionDeniedError,
  SIMULATED_ERROR_MESSAGES,
  SimulatedServiceError,
} from '@protoyard/core';
import { MEMBER_TRANSFER_LIMIT_CENTS } from '../domain/policy.ts';
import { TransferError, type TransferErrorCode } from '../domain/services.ts';
import { formatMoney } from './format.ts';

/**
 * One place that turns any failure from the banking services into words a
 * customer understands. Names are checked as well as classes because a
 * duplicated package copy would break `instanceof`.
 */

export interface FriendlyError {
  title: string;
  message: string;
  /** What the person can do next, when there is something. */
  hint?: string;
}

const TRANSFER_TITLES: Record<TransferErrorCode, string> = {
  'insufficient-funds': 'Not enough money',
  'account-locked': 'Account locked',
  'account-dormant': 'Account dormant',
  'over-limit': 'Over the transfer limit',
  'same-account': 'Same account',
  'not-found': 'Not found',
  invalid: 'Check the details',
};

const TRANSFER_HINTS: Partial<Record<TransferErrorCode, string>> = {
  'insufficient-funds': 'Try a smaller amount or move money from savings first.',
  'account-locked': 'The primary holder can unfreeze it from the account page.',
  'account-dormant': 'The primary holder can reactivate it from the account page.',
  'over-limit': 'Split the payment or choose another account.',
};

const isNamed = (error: unknown, name: string) => error instanceof Error && error.name === name;

export function describeError(error: unknown): FriendlyError {
  if (error instanceof TransferError || isNamed(error, 'TransferError')) {
    const e = error as TransferError;
    const hint = TRANSFER_HINTS[e.code];
    return {
      title: TRANSFER_TITLES[e.code] ?? 'Transfer failed',
      message: e.message,
      ...(hint ? { hint } : {}),
    };
  }
  if (error instanceof PermissionDeniedError || isNamed(error, 'PermissionDeniedError')) {
    const e = error as PermissionDeniedError;
    if (e.role === 'member' && e.capability === 'transfers:create') {
      return {
        title: 'Above your limit',
        message: `Joint holders can send up to ${formatMoney(MEMBER_TRANSFER_LIMIT_CENTS)} per transfer.`,
        hint: 'Ask the primary holder to send larger amounts.',
      };
    }
    if (e.role === 'viewer') {
      return {
        title: 'View-only access',
        message: 'Your access lets you see balances but not move money or change settings.',
        hint: 'Ask the primary holder for help.',
      };
    }
    return {
      title: 'Not allowed',
      message: `Your role can't do this (${e.capability}).`,
    };
  }
  if (error instanceof SimulatedServiceError || isNamed(error, 'SimulatedServiceError')) {
    const e = error as SimulatedServiceError;
    return {
      title: e.code === 'offline' ? 'You are offline' : 'Lumen Bank is unavailable',
      message: SIMULATED_ERROR_MESSAGES[e.code] ?? e.message,
      hint: 'Nothing was sent. Try again when the connection is back.',
    };
  }
  return {
    title: 'Something went wrong',
    message: error instanceof Error ? error.message : String(error),
  };
}
