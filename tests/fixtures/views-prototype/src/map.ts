import './shell-base.ts';
import { SimulatedMap } from '@protoyard/views-ui/map';
import { mount } from 'svelte';

// Only SimulatedMap on the first screen: what the map view adds to initial JS.
mount(SimulatedMap as never, {
  target: document.getElementById('app') as HTMLElement,
  props: {} as never,
});
