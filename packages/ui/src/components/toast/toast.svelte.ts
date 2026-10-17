export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  description?: string;
  /** Milliseconds before auto-dismiss. `0` or `Infinity` keeps the toast until dismissed. */
  duration?: number;
  /** Reuse an id to replace an existing toast (e.g. "Saving…" → "Saved"). */
  id?: string;
  action?: ToastAction;
}

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  duration: number;
  action?: ToastAction;
}

export interface ToastAnnouncement {
  id: string;
  text: string;
  assertive: boolean;
}

const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 8000,
};

/** Older toasts are dropped beyond this so the stack never covers the screen. */
export const MAX_TOASTS = 5;

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

class ToastStore {
  items = $state<ToastItem[]>([]);
  /** Latest message for the Toaster's live regions (errors are assertive). */
  announcement = $state<ToastAnnouncement | null>(null);

  #timers = new Map<string, Timer>();
  #counter = 0;
  #paused = false;

  show(kind: ToastKind, title: string, options: ToastOptions = {}): string {
    this.#counter += 1;
    const id = options.id ?? `toast-${this.#counter}`;
    const item: ToastItem = {
      id,
      kind,
      title,
      description: options.description,
      duration: options.duration ?? DEFAULT_DURATION[kind],
      action: options.action,
    };
    this.#clearTimer(id);
    const existing = this.items.findIndex((toast) => toast.id === id);
    if (existing >= 0) {
      this.items[existing] = item;
    } else {
      this.items.push(item);
      while (this.items.length > MAX_TOASTS) {
        const dropped = this.items.shift();
        if (dropped) this.#clearTimer(dropped.id);
      }
    }
    this.announcement = {
      id,
      text: item.description ? `${title}. ${item.description}` : title,
      assertive: kind === 'error',
    };
    this.#startTimer(id, item.duration);
    return id;
  }

  success = (title: string, options?: ToastOptions): string => this.show('success', title, options);
  error = (title: string, options?: ToastOptions): string => this.show('error', title, options);
  info = (title: string, options?: ToastOptions): string => this.show('info', title, options);
  warning = (title: string, options?: ToastOptions): string => this.show('warning', title, options);

  /** Dismiss one toast, or every toast when no id is given. */
  dismiss = (id?: string): void => {
    if (id === undefined) {
      for (const key of this.#timers.keys()) this.#clearTimer(key);
      this.items = [];
      this.#paused = false;
      return;
    }
    this.#clearTimer(id);
    this.items = this.items.filter((toast) => toast.id !== id);
    // The hovered stack unmounts when empty, so no mouseleave would ever resume it.
    if (this.items.length === 0) this.#paused = false;
  };

  /** Freeze every countdown (hover/focus on the stack) so users can read and act. */
  pause = (): void => {
    if (this.#paused) return;
    this.#paused = true;
    const now = Date.now();
    for (const timer of this.#timers.values()) {
      if (timer.handle === null) continue;
      clearTimeout(timer.handle);
      timer.handle = null;
      timer.remaining = Math.max(0, timer.remaining - (now - timer.startedAt));
    }
  };

  resume = (): void => {
    if (!this.#paused) return;
    this.#paused = false;
    for (const [id, timer] of this.#timers) this.#schedule(id, timer);
  };

  get paused(): boolean {
    return this.#paused;
  }

  #startTimer(id: string, duration: number): void {
    if (!Number.isFinite(duration) || duration <= 0) return;
    const timer: Timer = { handle: null, remaining: duration, startedAt: Date.now() };
    this.#timers.set(id, timer);
    if (!this.#paused) this.#schedule(id, timer);
  }

  #schedule(id: string, timer: Timer): void {
    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => this.dismiss(id), timer.remaining);
  }

  #clearTimer(id: string): void {
    const timer = this.#timers.get(id);
    if (timer?.handle) clearTimeout(timer.handle);
    this.#timers.delete(id);
  }
}

export type { ToastStore };

/** Global toast API. Render one `<Toaster />` near the app root. */
export const toast = new ToastStore();
