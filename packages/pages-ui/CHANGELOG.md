# @protoyard/pages-ui

## 1.1.0

### Minor Changes

- dfdf50e: Docs can be edited in Texuli's `PageEditor` and downloaded as Word, PDF or Markdown (`@texuli/document`). Applied edits are saved per doc and world in the content-kind runtime's new `docEdits` store (database version 2, `KIND_SCHEMA_VERSION`) and survive a reload; "Reset to the original" removes them, and a viewer persona cannot edit. Saved edits are re-validated on every load and reported as stale when the doc changed.
- dfdf50e: Forms render through Texuli's `SchemaForm` (`@texuli/forms`): generated entity forms (`EntityForm`, mapped by the new `entityFormModel`), page and doc form blocks, and the SaaS kit's notification preferences and member invite. Texuli checks required and range rules before the service runs; every submission still goes through the entity, form-response or SaaS service, whose issues show inline. Relation, datetime, geo, avatar and file fields keep Protoyard controls. `EntityForm` gains optional `title` and `showTitle`.

### Patch Changes

- dfdf50e: A doc's Edit and Reset follow a persona switch without a reload. The sheet view's "Import CSV" accepts a second file after the first.
- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [085df93]
- Updated dependencies [dfdf50e]
  - @protoyard/pages@1.1.0
  - @protoyard/blueprint@1.1.0
  - @protoyard/renderer-svelte@1.1.0
  - @protoyard/ui@1.1.0
  - @protoyard/blocks@1.1.0
  - @protoyard/blocks-ui@1.1.0
