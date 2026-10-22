/**
 * The words the renderer itself shows around a prototype: service error
 * toasts, router fallbacks, loading text, the storage, data-rebuilt and
 * linked-scenario banners, the frame toggles, the demo badge and the boot
 * error. English by default; a prototype in another language passes
 * `mountPrototype({ messages })` with any subset, and the rest stays English.
 *
 * Messages are plain strings (so they can live in JSON). `{name}` placeholders
 * are filled with text by `formatMessage` / `messageParts`; nothing is ever
 * rendered as HTML.
 */

export const DEFAULT_CHROME_MESSAGES = {
  service: {
    notAllowedTitle: 'Not allowed',
    notAllowedDescription:
      "Your role can't do this ({capability}). Switch persona in DevTools to try another role.",
    failedTitle: 'Request failed',
    unexpectedTitle: 'Something went wrong',
    offline: 'You are offline',
    timeout: 'Request timed out',
    serverError: 'Server error',
    permissionDenied: 'Request rejected',
    rateLimited: 'Slow down',
  },
  router: {
    notFoundCode: '404',
    notFoundTitle: 'Page not found',
    notFoundBody: 'Nothing lives at {path} in this prototype.',
    redirectLoopCode: 'Redirect loop',
    redirectLoopTitle: 'This page keeps redirecting',
    home: 'Go to the start page',
    loadingScreen: 'Loading screen',
    loadFailedTitle: 'This screen could not be loaded',
    openFailedTitle: 'This screen could not be opened',
    retry: 'Try again',
    close: 'Close',
  },
  pending: {
    working: 'Working…',
    loading: 'Loading…',
  },
  storage: {
    title: "Changes won't be saved.",
    body: 'Browser storage is unavailable, so this prototype runs in memory and resets when you reload.',
    dismiss: 'Dismiss storage warning',
  },
  staleWorld: {
    rebuiltLabel: 'Prototype data rebuilt',
    keptLabel: 'Prototype data kept',
    restored: 'Your previous data is back. It will not be rebuilt again on the next visit.',
    kept: "This prototype's generator changed, but its stored data was kept because a safety snapshot could not be saved. Reset the {scenario} scenario to rebuild it.",
    rebuilt:
      "This prototype's generator changed, so the stored data was rebuilt from the {scenario} scenario (seed {seed}).",
    keptWithDevtools:
      "This prototype's generator changed, but its stored data was kept because a safety snapshot could not be saved. Reset the {scenario} scenario to rebuild it (DevTools → Scenario, Ctrl or ⌘ + .).",
    snapshotSaved:
      'Your earlier data, edits included, was saved first as the snapshot “{snapshot}”. Restore it here.',
    snapshotSavedWithDevtools:
      'Your earlier data, edits included, was saved first as the snapshot “{snapshot}”. Restore it here, or later from DevTools → Snaps (Ctrl or ⌘ + .).',
    noSnapshot: 'This sandbox is disposable, so no snapshot was saved.',
    snapshotName: 'Before refreshing {scenario}',
    restore: 'Restore previous data',
    dismiss: 'Dismiss',
  },
  linkedScenario: {
    label: 'Linked scenario',
    body: 'This link opens the {scenario} scenario, but this browser already has its own data.',
    bodyWithSeed:
      'This link opens the {scenario} scenario (seed {seed}), but this browser already has its own data.',
    snapshotFirst: 'Snapshot my data first',
    load: 'Load linked scenario',
    keep: 'Keep my data',
  },
  frame: {
    enter: 'Show full screen',
    enterHint: 'Show full screen (Esc returns to the frame; Shift+click for browser full screen)',
    enterShort: 'Full screen',
    exit: 'Show in frame',
    exitHint: 'Show in frame (Esc)',
    fullScreenNotice: 'Full screen · press Esc to show the frame',
  },
  badge: {
    label: 'About this prototype',
    text: 'Prototype · simulated data',
    title: '{name} is an interactive prototype. Data is simulated and stored only in this browser.',
  },
  boot: {
    title: "{name} couldn't start",
    explanation:
      "Your prototype data lives only in this browser. Reloading usually helps; if the stored data is from a newer or broken version, you can reset this prototype's data (other prototypes are not affected).",
    reload: 'Reload',
    reset: 'Reset prototype data…',
    confirmReset: 'Yes, delete this prototype’s data',
    resetting: 'Resetting…',
    cancel: 'Cancel',
    otherTab: 'Another tab still has this prototype open. Close it and try again.',
  },
} as const;

type Strings<T> = { -readonly [K in keyof T]: T[K] extends string ? string : Strings<T[K]> };

/** Every chrome message, by group. */
export type ChromeMessages = Strings<typeof DEFAULT_CHROME_MESSAGES>;

/** What `mountPrototype({ messages })` accepts: any subset of groups and keys. */
export type ChromeMessagesInput = {
  [G in keyof ChromeMessages]?: Partial<ChromeMessages[G]>;
};

/** Long enough for a sentence in any language, short enough to stay chrome. */
export const CHROME_MESSAGE_MAX_LENGTH = 500;

/**
 * Merges overrides over the English defaults. Unknown groups or keys, empty
 * strings, non-strings and over-long values throw a `TypeError` naming the
 * key, so a typo fails when the prototype mounts instead of silently showing
 * English.
 */
export function resolveChromeMessages(input: ChromeMessagesInput = {}): ChromeMessages {
  const out = structuredClone(DEFAULT_CHROME_MESSAGES) as ChromeMessages;
  if (input === null || typeof input !== 'object') {
    throw new TypeError('messages must be an object of message groups');
  }
  for (const [group, values] of Object.entries(input)) {
    if (values === undefined) continue;
    if (!Object.hasOwn(DEFAULT_CHROME_MESSAGES, group)) {
      throw new TypeError(`Unknown message group "${group}"`);
    }
    if (values === null || typeof values !== 'object') {
      throw new TypeError(`messages.${group} must be an object`);
    }
    const target = out[group as keyof ChromeMessages] as Record<string, string>;
    for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
      if (value === undefined) continue;
      if (!Object.hasOwn(target, key)) throw new TypeError(`Unknown message "${group}.${key}"`);
      if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`messages.${group}.${key} must be a non-empty string`);
      }
      if (value.length > CHROME_MESSAGE_MAX_LENGTH) {
        throw new TypeError(
          `messages.${group}.${key} is longer than ${CHROME_MESSAGE_MAX_LENGTH} characters`
        );
      }
      target[key] = value;
    }
  }
  return out;
}

let current: ChromeMessages = resolveChromeMessages();

/** The messages in use: the defaults, or what the last `mountPrototype` set. */
export function chromeMessages(): ChromeMessages {
  return current;
}

/** Sets the messages (called by `mountPrototype`); returns the resolved set. */
export function setChromeMessages(input: ChromeMessagesInput = {}): ChromeMessages {
  current = resolveChromeMessages(input);
  return current;
}

/** One piece of a formatted message: literal text, or a filled placeholder. */
export interface MessagePart {
  text: string;
  /** The placeholder this part filled (`scenario`, `path`…), for emphasis. */
  value?: string;
}

const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;

/**
 * Splits a message into text parts and filled placeholders, so a component
 * can emphasize a value (`<strong>`, `<code>`) without rendering HTML. A
 * placeholder without a value stays as written.
 */
export function messageParts(
  template: string,
  values: Readonly<Record<string, string | number>> = {}
): MessagePart[] {
  const parts: MessagePart[] = [];
  let last = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    const [whole, key = ''] = match;
    const index = match.index ?? 0;
    if (!Object.hasOwn(values, key)) continue;
    if (index > last) parts.push({ text: template.slice(last, index) });
    parts.push({ text: String(values[key]), value: key });
    last = index + whole.length;
  }
  if (last < template.length) parts.push({ text: template.slice(last) });
  return parts;
}

/** The message with its placeholders filled, as plain text. */
export function formatMessage(
  template: string,
  values: Readonly<Record<string, string | number>> = {}
): string {
  return messageParts(template, values)
    .map((part) => part.text)
    .join('');
}
