import './shell-base.ts';
import { CanvasView } from '@protoyard/views-ui/canvas';
import { mount } from 'svelte';

// Only CanvasView on the first screen: what the canvas view adds to initial JS.
mount(CanvasView as never, {
  target: document.getElementById('app') as HTMLElement,
  props: {} as never,
});
