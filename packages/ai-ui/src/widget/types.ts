import type { ComponentProps } from 'svelte';
import type AssistantWorkspace from '../components/AssistantWorkspace.svelte';

export type AssistantWidgetMode = 'launcher' | 'sidebar' | 'fullscreen';

export type AssistantWidgetProps = ComponentProps<typeof AssistantWorkspace> & {
  /** Stable prototype slug used to isolate the saved display mode. */
  prototypeId: string;
};
