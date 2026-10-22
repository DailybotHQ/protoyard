import { mount } from 'svelte';
import blueprint from '../../../../../blueprints/decks/lumen-launch.json';
import flagship from '../../../../../blueprints/decks/protoyard-create-anything.json';
import { DeckSchema } from '../../../../../packages/decks/src/schema/index.ts';
import { DeckApp } from '../../../../../packages/decks-ui/src/app/index.ts';
import './style.css';

const catalogDeck = DeckSchema.parse(blueprint.deck);
const deck = DeckSchema.parse({
  ...catalogDeck,
  slides: catalogDeck.slides.map((slide) =>
    slide.id === 'cover'
      ? {
          ...slide,
          notes: 'Welcome everyone. Lumen is a fictional product used for this demo deck.',
        }
      : slide.id === 'divider'
        ? { ...slide, notes: 'Pause here and ask who has shipped a launch before.' }
        : slide.id === 'path'
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

// `?deck=flagship` serves the flagship deck (stepped blocks and code highlights,
// for deck-fragments.spec.ts); `&motion=none` turns its motion off.
const params = new URLSearchParams(window.location.search);
// The flagship timeline gets one stepped event so a catalog item reveal is covered too.
const flagshipDeck = DeckSchema.parse({
  ...flagship.deck,
  slides: flagship.deck.slides.map((slide) =>
    slide.id === 'timeline' && 'props' in slide
      ? {
          ...slide,
          props: {
            ...slide.props,
            events: (slide.props.events as Record<string, unknown>[]).map((event, index) =>
              index === 4 ? { ...event, step: 1, fragment: 'fade-up' } : event
            ),
          },
        }
      : slide
  ),
});
const chosen =
  params.get('deck') === 'flagship'
    ? params.get('motion') === 'none'
      ? DeckSchema.parse({ ...flagshipDeck, style: { ...flagshipDeck.style, motion: 'none' } })
      : flagshipDeck
    : deck;

const target = document.querySelector('#app');
if (!target) throw new Error('Deck navigation fixture is missing #app.');

mount(DeckApp, { target, props: { deck: chosen } });
