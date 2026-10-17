import { mountPrototype } from '@protoyard/renderer-svelte';
import App from './App.svelte';
import './app.css';
import { definition } from './prototype.ts';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element in index.html');

mountPrototype({ definition, App, target });
