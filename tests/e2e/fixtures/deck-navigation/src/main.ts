import { mount } from 'svelte';
import blueprint from '../../../../../blueprints/decks/lumen-launch.json';
import { DeckSchema } from '../../../../../packages/decks/src/schema/index.ts';
import { DeckApp } from '../../../../../packages/decks-ui/src/app/index.ts';
import './style.css';

const catalogDeck = DeckSchema.parse(blueprint.deck);
const deck = DeckSchema.parse({
  ...catalogDeck,
  slides: catalogDeck.slides.map((slide) =>
    slide.id === 'path'
      ? { ...slide, steps: ['Freeze scope', 'Seed the world', 'Walkthrough'] }
      : slide.id === 'quiz' && slide.layout === 'free'
        ? {
            ...slide,
            blocks: slide.blocks.map((block) =>
              block.type === 'text'
                ? {
                    ...block,
                    markdown: `${block.markdown}\n\n[Deck guide](https://example.com/deck-guide)`,
                  }
                : block
            ),
          }
        : slide
  ),
});

const target = document.querySelector('#app');
if (!target) throw new Error('Deck navigation fixture is missing #app.');

mount(DeckApp, { target, props: { deck } });
