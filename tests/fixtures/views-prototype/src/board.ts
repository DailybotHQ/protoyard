import './shell-base.ts';
import { BoardView } from '@protoyard/views-ui/board';
import { mount } from 'svelte';

// Only BoardView on the first screen: what the board view adds to initial JS.
mount(BoardView as never, {
  target: document.getElementById('app') as HTMLElement,
  props: {} as never,
});
