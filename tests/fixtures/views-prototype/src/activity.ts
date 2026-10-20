import './shell-base.ts';
import { CommentThread } from '@protoyard/views-ui/activity';
import { mount } from 'svelte';

// Only CommentThread: its siblings (ActivityFeed…) must not be bundled.
mount(CommentThread as never, {
  target: document.getElementById('app') as HTMLElement,
  props: {} as never,
});
