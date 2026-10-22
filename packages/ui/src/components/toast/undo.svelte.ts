/** Why an undo toast closed without its action being undone. */
export type UndoSettleReason = 'expired' | 'dismissed' | 'replaced' | 'evicted';

export interface UndoToastOptions {
  /** What just happened, in plain text ("Deleted 3 tasks"). */
  message: string;
  description?: string;
  /**
   * Reverts the action. A returned promise keeps the toast open and busy until
   * it settles; a rejection keeps it open with the error so the person can retry.
   */
  onUndo: () => void | Promise<void>;
  /** Called exactly once when the toast closes without an undo (commit the action here). */
  onSettle?: (reason: UndoSettleReason) => void;
  /** Milliseconds the undo stays available, clamped to 1–60 s. Default 10 s. */
  duration?: number;
  undoLabel?: string;
  /** Reuse an id to replace a pending undo; the replaced one settles as `replaced`. */
  id?: string;
}

export type UndoToastStatus = 'idle' | 'undoing' | 'failed';

export interface UndoToastItem {
  id: string;
  message: string;
  description?: string;
  undoLabel: string;
  duration: number;
  status: UndoToastStatus;
  error?: string;
  /** Bumped on every show so the countdown bar restarts for a replaced toast. */
  revision: number;
}

export interface UndoAnnouncement {
  id: string;
  text: string;
  assertive: boolean;
}

export const DEFAULT_UNDO_DURATION = 10_000;
export const MIN_UNDO_DURATION = 1_000;
export const MAX_UNDO_DURATION = 60_000;
/** Older pending undos settle beyond this so the stack never covers the screen. */
export const MAX_UNDO_TOASTS = 3;

interface Pending {
  onUndo: UndoToastOptions['onUndo'];
  onSettle?: UndoToastOptions['onSettle'];
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

function clampDuration(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_UNDO_DURATION;
  return Math.min(MAX_UNDO_DURATION, Math.max(MIN_UNDO_DURATION, Math.round(value)));
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Undo failed. Try again.';
}

class UndoToastStore {
  items = $state<UndoToastItem[]>([]);
  announcement = $state<UndoAnnouncement | null>(null);

  #pending = new Map<string, Pending>();
  #counter = 0;
  #paused = false;

  /** Offer an undo for an action that already happened. Returns the toast id. */
  show(options: UndoToastOptions): string {
    this.#counter += 1;
    const id = options.id ?? `undo-${this.#counter}`;
    const duration = clampDuration(options.duration);
    const item: UndoToastItem = {
      id,
      message: options.message,
      description: options.description,
      undoLabel: options.undoLabel?.trim() || 'Undo',
      duration,
      status: 'idle',
      revision: this.#counter,
    };
    const existing = this.items.findIndex((toast) => toast.id === id);
    if (existing >= 0) {
      this.#settle(id, 'replaced', false);
      this.items[existing] = item;
    } else {
      this.items.push(item);
      // An undo already running is never cut short; it closes on its own.
      while (this.items.length > MAX_UNDO_TOASTS) {
        const oldest = this.items.find((toast) => toast.status !== 'undoing' && toast.id !== id);
        if (!oldest) break;
        this.#settle(oldest.id, 'evicted');
      }
    }
    this.#pending.set(id, {
      onUndo: options.onUndo,
      onSettle: options.onSettle,
      handle: null,
      remaining: duration,
      startedAt: Date.now(),
    });
    this.#scheduleIfRunning(id);
    this.announcement = {
      id,
      text: `${options.message}. ${item.undoLabel} is available for ${Math.round(duration / 1000)} seconds.`,
      assertive: false,
    };
    return id;
  }

  /**
   * Runs the undo callback. Resolves true when the action was undone (the toast
   * closes) and false when the toast is unknown, already undoing, or the undo failed.
   */
  undo = async (id: string): Promise<boolean> => {
    const pending = this.#pending.get(id);
    const index = this.items.findIndex((toast) => toast.id === id);
    const item = this.items[index];
    if (!pending || !item || item.status === 'undoing') return false;
    this.#freeze(pending);
    this.items[index] = { ...item, status: 'undoing', error: undefined };
    try {
      await pending.onUndo();
    } catch (error) {
      const text = errorText(error);
      const at = this.items.findIndex((toast) => toast.id === id);
      const current = this.items[at];
      // The toast may have been replaced or dismissed while the undo ran.
      if (current && this.#pending.get(id) === pending) {
        this.items[at] = { ...current, status: 'failed', error: text };
        this.announcement = { id, text, assertive: true };
        this.#scheduleIfRunning(id);
      }
      return false;
    }
    if (this.#pending.get(id) === pending) {
      this.#pending.delete(id);
      this.items = this.items.filter((toast) => toast.id !== id);
      this.#unpauseWhenEmpty();
    }
    this.announcement = { id, text: `${item.message}: undone.`, assertive: false };
    return true;
  };

  /** Close one toast (or every toast) without undoing; each settles as `dismissed`. */
  dismiss = (id?: string): void => {
    const ids = id === undefined ? this.items.map((toast) => toast.id) : [id];
    for (const key of ids) {
      if (this.items.find((toast) => toast.id === key)?.status === 'undoing') continue;
      this.#settle(key, 'dismissed');
    }
  };

  /** Freeze every countdown (hover or focus on the stack) so people can read and act. */
  pause = (): void => {
    if (this.#paused) return;
    this.#paused = true;
    for (const pending of this.#pending.values()) this.#freeze(pending);
  };

  resume = (): void => {
    if (!this.#paused) return;
    this.#paused = false;
    for (const id of this.#pending.keys()) this.#scheduleIfRunning(id);
  };

  get paused(): boolean {
    return this.#paused;
  }

  /** Milliseconds left on a toast's undo window (frozen while paused or undoing). */
  remaining(id: string): number {
    const pending = this.#pending.get(id);
    if (!pending) return 0;
    if (pending.handle === null) return pending.remaining;
    return Math.max(0, pending.remaining - (Date.now() - pending.startedAt));
  }

  #settle(id: string, reason: UndoSettleReason, removeItem = true): void {
    const pending = this.#pending.get(id);
    if (pending?.handle) clearTimeout(pending.handle);
    this.#pending.delete(id);
    if (removeItem) {
      this.items = this.items.filter((toast) => toast.id !== id);
      this.#unpauseWhenEmpty();
    }
    pending?.onSettle?.(reason);
  }

  #freeze(pending: Pending): void {
    if (pending.handle === null) return;
    clearTimeout(pending.handle);
    pending.handle = null;
    pending.remaining = Math.max(0, pending.remaining - (Date.now() - pending.startedAt));
  }

  #scheduleIfRunning(id: string): void {
    const pending = this.#pending.get(id);
    const item = this.items.find((toast) => toast.id === id);
    if (!pending || !item || this.#paused || item.status === 'undoing' || pending.handle) return;
    pending.startedAt = Date.now();
    pending.handle = setTimeout(() => {
      pending.handle = null;
      this.#settle(id, 'expired');
    }, pending.remaining);
  }

  // The hovered stack unmounts when empty, so no mouseleave would ever resume it.
  #unpauseWhenEmpty(): void {
    if (this.items.length === 0) this.#paused = false;
  }
}

export type { UndoToastStore };

/** Global undo-toast API. Render one `<UndoToaster />` near the app root. */
export const undoToast = new UndoToastStore();
