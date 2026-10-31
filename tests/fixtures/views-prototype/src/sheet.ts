import './shell-base.ts';
import { SheetView } from '@protoyard/views-ui/sheet';
import { mount } from 'svelte';

// Only SheetView on the first screen: what the sheet view adds to initial JS.
mount(SheetView as never, {
  target: document.getElementById('app') as HTMLElement,
  props: {} as never,
});
