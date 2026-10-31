---
"@protoyard/crud": minor
"@protoyard/blueprint": minor
"@protoyard/pages-ui": minor
"@protoyard/saas-ui": minor
---

Forms render through Texuli's `SchemaForm` (`@texuli/forms`): generated entity forms (`EntityForm`, mapped by the new `entityFormModel`), page and doc form blocks, and the SaaS kit's notification preferences and member invite. Texuli checks required and range rules before the service runs; every submission still goes through the entity, form-response or SaaS service, whose issues show inline. Relation, datetime, geo, avatar and file fields keep Protoyard controls. `EntityForm` gains optional `title` and `showTitle`.
