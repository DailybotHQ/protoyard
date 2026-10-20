import './shell-base.ts';
import { DataGrid } from '@protoyard/views-ui/grid';
import { mount } from 'svelte';

// Only DataGrid on the first screen: what the grid view adds to initial JS.
mount(DataGrid as never, {
  target: document.getElementById('app') as HTMLElement,
  props: {} as never,
});
