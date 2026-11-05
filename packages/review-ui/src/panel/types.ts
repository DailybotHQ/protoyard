import type { PrototypeRuntime } from '@protoyard/core';
import type { ReviewComment, ReviewContext } from '@protoyard/core/review';
import type { ComponentProps } from 'svelte';
import type { LabelsProvider } from 'texuli/i18n';

/**
 * The prototype's label dictionary (`mountPrototype({ i18n })`). The review UI
 * mounts outside the app's component tree, so each of its roots applies it.
 */
export type ReviewI18n = Pick<ComponentProps<typeof LabelsProvider>, 'labels' | 'locale'>;

/** The small runtime surface the panel needs; scenario loads save a safety snapshot. */
export type ReviewRuntime = {
  scenarios: {
    active(): { scenario: { id: string } } | null;
    load: PrototypeRuntime['scenarios']['load'];
  };
  session: {
    principal(): { persona: { id: string } } | null;
    switchActor: PrototypeRuntime['session']['switchActor'];
  };
  theme: {
    appearance(): {
      theme: { value: string };
      mode: { value: string };
      shell: { value: string };
    };
    setOverride: PrototypeRuntime['theme']['setOverride'];
  };
};

export interface ReviewPanelProps {
  comments: readonly ReviewComment[];
  currentContext?: ReviewContext;
  runtime?: ReviewRuntime;
  /** Prototype root used to scroll a restored anchor into view. */
  root?: HTMLElement;
  /** Receives the pin id so the overlay can reveal and pulse it. */
  focusThread?: (threadId: string) => void;
  /** Reveal resolved pins before focusing one from a resolved thread. */
  setShowResolved?: (show: boolean) => void;
  /** Defaults to the renderer's hash-router navigate helper. */
  onNavigate?: (path: string) => void | Promise<void>;
  /** Optional accurate orphan status from the mounted anchor resolver. */
  orphanedThreadIds?: readonly string[];
  /** The prototype's dictionary, for hosts outside its LabelsProvider (DevTools, a floating panel). */
  i18n?: ReviewI18n;
}
