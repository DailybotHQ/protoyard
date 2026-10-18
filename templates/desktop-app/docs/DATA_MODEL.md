# Desktop App: data model

## Overview

TODO: the domain in words, and why the model looks this way.

## Tables

<!-- protoyard:generated:tables -->
| Table | Primary key | Indexes |
| --- | --- | --- |
| `documents` | `id` (unique) | `authorId`, `folderId`, `tagIds` (multi-entry), `title`, `updatedAt` |
| `folders` | `id` (unique) | `createdAt`, `name` |
| `tags` | `id` (unique) | `name` (unique) |
<!-- /protoyard:generated:tables -->

## Diagram

<!-- protoyard:generated:er-diagram -->
```mermaid
erDiagram
  documents {
    string id PK
    string authorId
    string folderId FK
    string tagIds
    string title
    string updatedAt
  }
  folders {
    string id PK
    string createdAt
    string name
  }
  tags {
    string id PK
    string name
  }
  folders ||--o{ documents : folderId
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
| 1 | `documents`, `folders`, `tags` | — | — |
<!-- /protoyard:generated:versions -->

## Migrations

TODO: what each `upgrade` does to existing rows.
