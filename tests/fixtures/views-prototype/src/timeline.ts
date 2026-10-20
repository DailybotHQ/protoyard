import './shell-base.ts';
import { TimelineView } from '@protoyard/views-ui/timeline';
import { mount } from 'svelte';

// Only TimelineView on the first screen: what the timeline view adds to initial JS.
mount(TimelineView as never, {
  target: document.getElementById('app') as HTMLElement,
  props: {} as never,
});
