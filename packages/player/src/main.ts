import { parseBlueprint } from '@protoyard/blueprint';
import { bootPlayer } from './boot.ts';
import demo from './fixtures/demo.blueprint.json';
import './app.css';

const target = document.getElementById('app');
if (!target) throw new Error('index.html must contain <div id="app"></div>');

// The bundled demo blueprint. Loading from files, links and messages is added
// by the player's source resolution (see README).
void bootPlayer({ blueprint: parseBlueprint(demo), target });
