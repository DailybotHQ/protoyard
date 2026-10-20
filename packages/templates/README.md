# @protoyard/templates

Every Protoyard starter template, packed so `protoyard new` works outside the
Protoyard repository (ADR-028). Inside the repository, `templates/` at the root
is the only source of truth: this package's `prepack` step copies it in and
`postpack` removes the copy, so nothing is committed twice.

```ts
import { listTemplates, templateDir } from '@protoyard/templates';

listTemplates().map((t) => t.name); // ['admin-console', 'agent-console', …]
templateDir('dashboard'); // absolute folder holding protoyard.json
```

- `listTemplates(root?)`: every folder with a `protoyard.json`, sorted by name.
  Each entry has `name`, `dir` and the parsed (not validated) `manifest`.
- `templateDir(name, root?)`: the folder for one template. A name that is not a
  slug, or has no `protoyard.json`, throws.
- `TEMPLATES_ROOT`: the packed `templates/` when installed from npm, otherwise
  the repository's `templates/`.

The copy skips what `protoyard new` never copies (`node_modules`, `dist`,
local state, `.env*` except `.env.example`) and test output. Templates keep
their own `tests/`, which become the new prototype's tests.
