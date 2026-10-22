/** A value a chat form field submits. */
export type MessageFormValue = string | number | boolean | string[] | null;

interface ActionBase {
  /** The message's `id`, or null when it has none. */
  messageId: string | null;
  /** Index of the block in `message.blocks`. */
  blockIndex: number;
  /** The block's or button's action id. */
  action: string;
}

/**
 * What a chat message reports when someone acts on it. The host (a prototype
 * service) decides what happens; the renderer only reports the typed event
 * and shows pending, error or done feedback around the returned promise.
 */
export type MessageActionEvent =
  | (ActionBase & { kind: 'button'; value: string | null })
  | (ActionBase & { kind: 'select'; values: string[] })
  | (ActionBase & { kind: 'form'; values: Record<string, MessageFormValue> });

/**
 * Handles an action. Return a promise to keep the control busy until it
 * settles; a rejection shows its message next to the control and re-enables it.
 */
export type MessageActionHandler = (event: MessageActionEvent) => unknown | Promise<unknown>;

/** Runs `work`, turning a throw or rejection into a short message. */
export async function settle(work: () => unknown | Promise<unknown>): Promise<string | null> {
  try {
    await Promise.resolve(work());
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message.trim() : '';
    return message ? message.slice(0, 200) : 'The action could not be completed.';
  }
}
