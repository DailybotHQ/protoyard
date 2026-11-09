# @protoyard/saas-ui

## 1.6.0

### Patch Changes

- Updated dependencies [61fd849]
- Updated dependencies [10e69ef]
  - @protoyard/ui@1.6.0
  - @protoyard/renderer-svelte@1.6.0
  - @protoyard/core@1.6.0
  - @protoyard/saas@1.6.0

## 1.5.0

### Patch Changes

- Updated dependencies [e9af874]
  - @protoyard/ui@1.5.0
  - @protoyard/renderer-svelte@1.5.0
  - @protoyard/core@1.5.0
  - @protoyard/saas@1.5.0

## 1.4.3

### Patch Changes

- Updated dependencies [64c1a28]
  - @protoyard/renderer-svelte@1.4.3
  - @protoyard/core@1.4.3
  - @protoyard/saas@1.4.3
  - @protoyard/ui@1.4.3

## 1.4.2

### Patch Changes

- e09e5f4: Final-review fixes for PLAN_010 to 012. `gallery build --out` and `sweep --out` go through the output guard, so they never empty the workspace or its sources. `FilePreview` no longer stays on "Loading preview…" after leaving a pending load. The phone calendar falls back to the month view when its agenda chunk cannot load. `SsoButtons` ignores engine `scenarios` under `provideSaas({ ports })` (new `hasSaasRuntime`). The offline plugin resets per build in watch mode. A failed full-screen switch no longer leaves the hint pending.
- Updated dependencies [e09e5f4]
  - @protoyard/renderer-svelte@1.4.2
  - @protoyard/core@1.4.2
  - @protoyard/saas@1.4.2
  - @protoyard/ui@1.4.2

## 1.4.1

### Patch Changes

- Updated dependencies [a14a4f7]
- Updated dependencies [c399afd]
  - @protoyard/renderer-svelte@1.4.1
  - @protoyard/ui@1.4.1
  - @protoyard/saas@1.4.1
  - @protoyard/core@1.4.1

## 1.4.0

### Minor Changes

- Universal gaps from Corag's register: kits and wrappers resolve their words through the prototype dictionary, renderer, deck, design-system, tooling and budget additions, Texuli 0.14.1.

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.4.0
  - @protoyard/renderer-svelte@1.4.0
  - @protoyard/saas@1.4.0
  - @protoyard/core@1.4.0

## 1.3.0

### Minor Changes

- Kit screens on domain adapters (ADR-046): ports for saas-ui, flows-ui, gamification-ui and pages-ui forms; board, calendar, files and timeline gaps in views-ui; voice session callbacks; Texuli 0.14.0.

### Patch Changes

- Updated dependencies
  - @protoyard/ui@1.3.0
  - @protoyard/renderer-svelte@1.3.0
  - @protoyard/core@1.3.0
  - @protoyard/saas@1.3.0

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
