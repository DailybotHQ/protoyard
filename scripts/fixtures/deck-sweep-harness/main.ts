/**
 * Minimal mount surface for `scripts/sweep-deck.ts`.
 * Loads a kind:deck blueprint (injected as `@deck-blueprint.json`) and mounts DeckApp.
 */

import blueprint from '@deck-blueprint.json'; // virtual module from sweep-deck.ts
import { DeckApp } from '@protoyard/decks-ui/app';
import { mount } from 'svelte';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');

const deck =
  blueprint && typeof blueprint === 'object' && 'deck' in blueprint
    ? (blueprint as { deck: import('@protoyard/decks').Deck }).deck
    : null;
if (!deck) throw new Error('Blueprint is missing a deck body.');

document.documentElement.dataset.pyMode = 'light';
mount(DeckApp, { target: root, props: { deck, autofocus: true, syncHash: true } });
