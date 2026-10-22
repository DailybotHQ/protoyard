import type { Component } from 'svelte';
import { propsFromSource } from './props.ts';

const demoModules = import.meta.glob<{ default: Component }>('../demos/**/*.svelte');
const sourceModules = import.meta.glob<string>('../demos/**/*.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export function demoLoader(name: string): () => Promise<Component> {
  const path = `../demos/components/${name}.svelte`;
  const loader = demoModules[path];
  if (!loader) throw new Error(`Unknown design-kit demo: ${name}`);
  return async () => (await loader()).default;
}

export function demoProps(name: string) {
  const source = sourceModules[`../demos/components/${name}.svelte`];
  return source ? propsFromSource(source) : [];
}
