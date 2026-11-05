# @protoyard/saas-ui

## 1.2.4

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.2.4
  - @protoyard/renderer-svelte@1.2.4
  - @protoyard/saas@1.2.4
  - @protoyard/core@1.2.4

## 1.2.3

### Patch Changes

- @protoyard/core@1.2.3
  - @protoyard/renderer-svelte@1.2.3
  - @protoyard/saas@1.2.3
  - @protoyard/ui@1.2.3

## 1.2.2

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.2.2
  - @protoyard/renderer-svelte@1.2.2
  - @protoyard/core@1.2.2
  - @protoyard/saas@1.2.2

## 1.2.1

### Patch Changes

- @protoyard/core@1.2.1
  - @protoyard/renderer-svelte@1.2.1
  - @protoyard/saas@1.2.1
  - @protoyard/ui@1.2.1

## 1.2.0

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.2.0
  - @protoyard/renderer-svelte@1.2.0
  - @protoyard/saas@1.2.0
  - @protoyard/ui@1.2.0

## 1.1.3

### Patch Changes

- @protoyard/core@1.1.3
  - @protoyard/renderer-svelte@1.1.3
  - @protoyard/saas@1.1.3
  - @protoyard/ui@1.1.3

## 1.1.2

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.2
  - @protoyard/renderer-svelte@1.1.2
  - @protoyard/saas@1.1.2
  - @protoyard/ui@1.1.2

## 1.1.1

### Patch Changes

- Updated dependencies
  - @protoyard/core@1.1.1
  - @protoyard/renderer-svelte@1.1.1
  - @protoyard/saas@1.1.1
  - @protoyard/ui@1.1.1

## 1.1.0

### Minor Changes

- dfdf50e: Forms render through Texuli's `SchemaForm` (`@texuli/forms`): generated entity forms (`EntityForm`, mapped by the new `entityFormModel`), page and doc form blocks, and the SaaS kit's notification preferences and member invite. Texuli checks required and range rules before the service runs; every submission still goes through the entity, form-response or SaaS service, whose issues show inline. Relation, datetime, geo, avatar and file fields keep Protoyard controls. `EntityForm` gains optional `title` and `showTitle`.
- 085df93: The SaaS kit's sign-in, sign-up, password reset, magic link, phone sign-in and code, MFA and profile forms, and the onboarding wizard, render through Texuli's `SchemaForm`. The wizard is one multi-step form whose steps save through the onboarding service. Simulated password fields use Texuli's password type with `autocomplete="off"`.

### Patch Changes

- Updated dependencies [dfdf50e]
- Updated dependencies [dfdf50e]
- Updated dependencies [085df93]
- Updated dependencies [dfdf50e]
  - @protoyard/core@1.1.0
  - @protoyard/renderer-svelte@1.1.0
  - @protoyard/ui@1.1.0
  - @protoyard/saas@1.1.0
