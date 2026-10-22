import { mountPrototype } from '@protoyard/renderer-svelte';
import App from './App.svelte';
import './app.css';
import { definition } from './prototype.ts';

const target = document.getElementById('app');
if (!target) throw new Error('index.html must contain <div id="app"></div>');

if (new URLSearchParams(location.search).has('__py_embed')) {
  void import('./embed-entry.ts');
} else {
  document.documentElement.dataset.pyHostNamespace = definition.manifest.storage.namespace;
  void mountPrototype({ definition, App, target });
}
