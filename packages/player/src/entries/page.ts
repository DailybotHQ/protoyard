import { runKindEntry } from './run-kind.ts';
import './page.css';

const target = document.getElementById('app');
if (!target) throw new Error('page.html must contain <div id="app"></div>');

// Same sources as index.html (#bp=, ?src=, the picker, an embedder); only pages boot here.
void runKindEntry({ kind: 'page', window, target });
