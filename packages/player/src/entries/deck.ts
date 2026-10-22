import { runKindEntry } from './run-kind.ts';
import './deck.css';

const target = document.getElementById('app');
if (!target) throw new Error('deck.html must contain <div id="app"></div>');

// Same sources as index.html (#bp=, ?src=, the picker, an embedder); only decks boot here.
void runKindEntry({ kind: 'deck', window, target });
