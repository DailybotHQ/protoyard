/**
 * Keeps the launcher's unread badge in step with the support thread.
 *
 * Every change (a new message, a reply finishing, the panel opening or
 * closing) calls `sync(viewing)`. Calls run strictly one after another, and a
 * call that a newer one has already replaced is skipped, so the badge always
 * ends on the latest state:
 *
 * - `viewing` (the panel is open): mark the thread read, then show 0.
 * - not viewing: leave the read marker alone and show the unread count, so
 *   messages that arrive while the panel is closed raise the badge.
 */
export interface UnreadSyncDeps {
  unreadCount(): Promise<number>;
  markRead(): Promise<void>;
  setUnread(count: number): void;
}

export interface UnreadSync {
  /** Queues one update; the promise settles when it (or its skip) is done. */
  sync(viewing: boolean): Promise<void>;
}

export function createUnreadSync(deps: UnreadSyncDeps): UnreadSync {
  let queue: Promise<void> = Promise.resolve();
  let latest = 0;
  return {
    sync(viewing) {
      latest += 1;
      const ticket = latest;
      queue = queue
        .then(async () => {
          if (ticket !== latest) return;
          if (viewing) {
            await deps.markRead();
            deps.setUnread(0);
          } else {
            deps.setUnread(await deps.unreadCount());
          }
        })
        .catch((error: unknown) => {
          // A failed read never blocks the next update.
          console.warn('[support-widget-demo] unread badge update failed', error);
        });
      return queue;
    },
  };
}
