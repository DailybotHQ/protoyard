# Blocks UI from `@texuli/blocks`

Every family Texuli ships renders through `@texuli/blocks/*/renderers`, with
thin adapters where Protoyard data shapes differ.

| Family | Texuli path | Adapter notes |
| --- | --- | --- |
| `text` | `text/renderers` TextBlockView | list/quote/callout/heading/text mapped; divider → structure |
| `media` | `media/renderers` MediaBlockView | image/video (+ figure/gallery); **people** is a Protoyard extension |
| `data` | `data/renderers` DataBlockView | table/stat field map; **chart** via ChartSpec→Texuli series points |
| `structure` | `structure/renderers` | columns/grid/tabs/accordion/cards/divider/cta when valid; nested Protoyard-only children fall back locally |
| `code` | `code/renderers` | host step → hostStep |
| `diagram` | `diagram/renderers` | flow/tree/board/terminal |
| `interactive` | `interactive/renderers` | poll/quiz/calculator/checklist when no BlockStateHost; with host (decks) local host-backed adapters |
| `map` | `map/renderers` | shape/tone adapter (`toTexuliMapBlock`) |
| `embed` | `embed/renderers` | mountEmbed + startLabel; sandbox helpers re-exported from `@texuli/blocks/embed` |

## Protoyard extensions (Texuli has no type)

| Type | Family | Note |
| --- | --- | --- |
| `people` | media | Portrait grid on `@protoyard/avatars` |
| `timeline` | structure | Event list |
| `steps` | structure | Numbered steps |
| `comparison` | structure | Side-by-side columns |
| `icon` | structure | Allow-listed Lucide name |
| `form` | interactive | Host form responses |
| `counter` | interactive | BlockStateHost counter |
| `chart-controls` | interactive | Live ChartSpec controls |
| `reveal` | interactive | Stepped reveal panels |
| `tabs` | interactive | Host-backed tab state (structure tabs when no host) |

Root `BlockRenderer`, `registry`, and `setBlockHost` stay the Protoyard host contract.
