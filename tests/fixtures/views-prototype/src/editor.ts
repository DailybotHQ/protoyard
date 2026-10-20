import './shell-base.ts';
import { MarkdownEditor } from '@protoyard/views-ui/editor';
import { mount } from 'svelte';

// Only MarkdownEditor on the first screen: what the editor view adds to initial JS.
mount(MarkdownEditor as never, {
  target: document.getElementById('app') as HTMLElement,
  props: {} as never,
});
