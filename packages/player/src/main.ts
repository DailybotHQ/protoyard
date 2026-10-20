import { startPlayer } from './sources/start.ts';
import './app.css';

const target = document.getElementById('app');
if (!target) throw new Error('index.html must contain <div id="app"></div>');

// Resolves the blueprint (#bp= share link, then ?src=./blueprint.json, then
// the picker) through the untrusted loader, then boots it (see README).
void startPlayer({ target });
