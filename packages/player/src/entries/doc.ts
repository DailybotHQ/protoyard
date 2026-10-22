import { runKindEntry } from './run-kind.ts';
import './doc.css';

const target = document.getElementById('app');
if (!target) throw new Error('doc.html must contain <div id="app"></div>');

// Same sources as index.html (#bp=, ?src=, the picker, an embedder); only docs boot here.
void runKindEntry({ kind: 'doc', window, target });
