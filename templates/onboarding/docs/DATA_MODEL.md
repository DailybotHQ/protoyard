# Onboarding Wizard: data model

## Overview

TODO: the domain in words, and why the model looks this way.

## Tables

<!-- protoyard:generated:tables -->
| Table | Primary key | Indexes |
| --- | --- | --- |
| `invitations` | `id` (unique) | `createdAt`, `email`, `invitedBy`, `status` |
| `onboarding` | `id` (unique) | `completedAt`, `currentStep`, `personaId` |
| `workspaces` | `id` (unique) | `slug` |
<!-- /protoyard:generated:tables -->

## Diagram

<!-- protoyard:generated:er-diagram -->
```mermaid
erDiagram
  invitations {
    string id PK
    string createdAt
    string email
    string invitedBy
    string status
  }
  onboarding {
    string id PK
    string completedAt
    string currentStep
    string personaId
  }
  workspaces {
    string id PK
    string slug
  }
```

_Indexed fields only. Relations are inferred from indexed `…Id` fields that match a table name; describe the rest by hand._
<!-- /protoyard:generated:er-diagram -->

## Relations

TODO: foreign keys and cardinalities the diagram cannot infer.

## Field notes

TODO: units (integer cents, ISO dates), enums and invariants.

## Schema history

<!-- protoyard:generated:versions -->
| Version | Adds | Changes indexes | Deletes |
| --- | --- | --- | --- |
| 1 | `invitations`, `onboarding`, `workspaces` | — | — |
<!-- /protoyard:generated:versions -->

## Migrations

TODO: what each `upgrade` does to existing rows.
