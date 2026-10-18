# Plugin panel template

A narrow plugin-panel starter for connection settings, an editable list of
connected items, and an in-app simulated account-consent step. It defaults to
the brand-neutral `side-panel` shell with a fictional code-editor host.

```bash
pnpm protoyard new my-plugin --template plugin-panel
pnpm protoyard dev my-plugin
```

## Scenarios

| Id | What it shows |
| --- | --- |
| `empty` | A fresh panel with no connected items. |
| `connected-workspace` | Two connected tools and enabled automatic sync. |
| `sync-paused` | A connection and workspace with sync paused. |
| `connect-error` | The simulated integration service is unavailable. |
| `read-only` | A viewer can inspect but cannot change connections or settings. |

## Boundaries

The Connect account dialog is a local simulation: there is no OAuth redirect,
provider SDK, credential capture, or network request. Connection and preference
data are stored in this prototype's IndexedDB. Services enforce simulated role
capabilities, validate inputs, run through the simulated environment, and
write in Dexie transactions. These roles are UX behavior, not security.

The panel targets a 320–420px host width and keeps its own content scrollable.
The side-panel frame can be changed in `protoyard.json` or through DevTools.
