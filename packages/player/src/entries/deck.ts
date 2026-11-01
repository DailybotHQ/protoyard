import { DECK_LOADERS } from '../kinds/renderer-deck.ts';
import { runKindEntry } from './run-kind.ts';
import './deck.css';

const target = document.getElementById('app');
if (!target) throw new Error('deck.html must contain <div id="app"></div>');

// Same sources as index.html (#bp=, ?src=, the picker, an embedder); only decks boot here.
// Only this kind's renderer: a deck page (and its single-file export) never names the others.
void runKindEntry({ kind: 'deck', window, target, loaders: DECK_LOADERS });
