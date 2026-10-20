import { runPlayer } from './run.ts';
import './app.css';

const target = document.getElementById('app');
if (!target) throw new Error('index.html must contain <div id="app"></div>');

// Resolves the blueprint (#bp= share link, then ?src=./blueprint.json, then
// the picker) through the untrusted loader and boots it. A framed player also
// accepts blueprints from its embedder over protoyard-player/1 (see README).
void runPlayer({ window, target });
