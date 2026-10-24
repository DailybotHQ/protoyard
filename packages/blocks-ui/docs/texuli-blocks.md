# Blocks UI from `@texuli/blocks`

| Family | Source |
| --- | --- |
| `diagram` | `@texuli/blocks/diagram/renderers` |
| `code` | `@texuli/blocks/code/renderers` (+ token style class adapter, host step) |
| `text` | Local Protoyard markdown/media policy + list/quote/divider extensions; Texuli `TextBlockView` for plain heading |
| `media` | `@texuli/blocks/media/renderers` for image/video (+ `blocks:media-ready`); local `people` |
| `map` | Protoyard `@protoyard/views-ui/map` adapter (tone table + kit styles) |
| `embed` | Protoyard host `mountEmbed` adapter |
| `data` | Protoyard ChartSpec adapter on `@protoyard/charts-ui` |
| `structure` | Protoyard deck/page adapter (timeline/steps/comparison/icon) |
| `interactive` | Host-backed adapter on `@protoyard/blocks/interactive` (Texuli is ephemeral) |

Root `BlockRenderer`, `registry`, and `setBlockHost` stay the Protoyard host
contract for decks, pages, docs and the player.
