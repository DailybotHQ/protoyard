import { mountPrototype } from '@protoyard/renderer-svelte';
import App from './App.svelte';
import './app.css';
import { definition } from './prototype.ts';

const target = document.getElementById('app');
if (!target) throw new Error('index.html must contain <div id="app"></div>');

void mountPrototype({ definition, App, target });
