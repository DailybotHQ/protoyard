import type { PrototypeRuntime } from '@protoyard/core';
import { parseInput, ValidationError } from '@protoyard/core';
import {
  createInbox,
  type InboxListOptions,
  type InboxService,
  type SaasAccount,
  type SaasInboxMessage,
} from '@protoyard/saas';
import { z } from 'zod';

/**
 * The simulated inbox of an account that signed up but has not confirmed its
 * email yet. Sign-up leaves the visitor signed out, so the regular inbox
 * (signed-in only) cannot show the confirmation message. The sign-up screen
 * links here with the new account id (`#/inbox?account=…`), and this service
 * shows that account's own messages and nothing else. Anyone who knows an
 * unverified account's id could therefore confirm that sign-up; it never
 * opens a session (sign-in still needs the password). A single-use hand-off
 * token, like the kit's MFA `?challenge=`, would close that gap.
 *
 * No capability is checked: there is no principal yet, and the link stands
 * for owning the mailbox (like a verification link). Simulation only, not
 * security: anyone with the account id can open it.
 */

const ACCOUNTS = 'saas_accounts';
export const PENDING_INBOX_UNAVAILABLE =
  'This inbox link only works for an account waiting for email confirmation. Sign in to read your inbox.';

const AccountIdSchema = z.string().trim().min(1, PENDING_INBOX_UNAVAILABLE).max(200);

interface AccountTable {
  get(id: string): Promise<SaasAccount | undefined>;
}
interface DatabaseLike {
  table(name: string): AccountTable;
}

export interface PendingInbox {
  /** The pending account's address: the only mailbox this inbox shows. */
  email: string;
  /** An `InboxService` scoped to that address (for the kit's `InboxDrawer`). */
  service: InboxService;
}

/** The in-app link the sign-up screen offers for a new, unverified account. */
export function pendingInboxHref(account: { id: string }): string {
  return `#/inbox?account=${encodeURIComponent(account.id)}`;
}

export function createPendingInboxServices(runtime: PrototypeRuntime) {
  const db = runtime.db as unknown as DatabaseLike;
  const inbox = createInbox(runtime);

  async function pendingAccount(accountId: string): Promise<SaasAccount> {
    const id = parseInput(z.object({ accountId: AccountIdSchema }), { accountId }).accountId;
    const account = await db.table(ACCOUNTS).get(id);
    if (!account || account.emailVerified || account.status !== 'active') {
      throw new ValidationError({ form: PENDING_INBOX_UNAVAILABLE });
    }
    return account;
  }

  return {
    /**
     * Opens the inbox of a pending account. Refuses unknown, verified, locked
     * or disabled accounts (a verified account signs in and uses the regular
     * inbox).
     */
    async open(accountId: string): Promise<PendingInbox> {
      const { email } = await pendingAccount(accountId);

      const own = async (id: string): Promise<SaasInboxMessage> => {
        const message = await inbox.get(id);
        if (!message || message.recipient !== email) {
          throw new ValidationError({ form: 'This message is not in your simulated inbox.' });
        }
        return message;
      };

      const service: InboxService = {
        list(options: InboxListOptions = {}) {
          if (options.recipient && options.recipient.trim().toLowerCase() !== email) {
            return Promise.reject(
              new ValidationError({ form: `This simulated inbox only shows ${email}.` })
            );
          }
          const { personaId: _personaId, ...rest } = options;
          return inbox.list({ ...rest, recipient: email });
        },
        async get(id) {
          const message = await inbox.get(id);
          return message?.recipient === email ? message : undefined;
        },
        async markRead(id) {
          await own(id);
          return inbox.markRead(id);
        },
        async archive(id) {
          await own(id);
          return inbox.archive(id);
        },
        deliver() {
          return Promise.reject(
            new ValidationError({ form: 'A pending account cannot send messages.' })
          );
        },
        write() {
          return Promise.reject(
            new ValidationError({ form: 'A pending account cannot send messages.' })
          );
        },
      };
      return { email, service };
    },
  };
}

export type PendingInboxServices = ReturnType<typeof createPendingInboxServices>;
