import { Button } from '@protoyard/ui';
import { mount } from 'svelte';

// Reference: an app that imports only the ui Button (the ui barrel's floor).
mount(Button as never, {
  target: document.getElementById('app') as HTMLElement,
  props: {} as never,
});
