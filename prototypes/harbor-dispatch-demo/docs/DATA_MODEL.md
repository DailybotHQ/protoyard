# Harborlight Dispatch: data model

## Overview

TODO: the domain in words, and why the model looks this way.

## Tables

<!-- protoyard:generated:tables -->
| Table | Primary key | Indexes |
| --- | --- | --- |
| `auditEntries` | `id` (unique) | `action`, `actorId`, `at`, `entity`, `recordId` |
| `depots` | `id` (unique) | `createdAt`, `name`, `updatedAt` |
| `drivers` | `id` (unique) | `createdAt`, `name`, `updatedAt` |
| `shipments` | `id` (unique) | `assignedToId`, `createdAt`, `depotId`, `driverId`, `trackingCode`, `updatedAt`, `vehicleId` |
| `vehicles` | `id` (unique) | `createdAt`, `unit`, `updatedAt` |
<!-- /protoyard:generated:tables -->

## Diagram

<!-- protoyard:generated:er-diagram -->
```mermaid
erDiagram
  auditEntries {
    string id PK
    string action
    string actorId
    string at
    string entity
    string recordId
  }
  depots {
    string id PK
    string createdAt
    string name
    string updatedAt
  }
  drivers {
    string id PK
    string createdAt
    string name
    string updatedAt
  }
  shipments {
    string id PK
    string assignedToId
    string createdAt
    string depotId FK
    string driverId FK
    string trackingCode
    string updatedAt
    string vehicleId FK
  }
  vehicles {
    string id PK
    string createdAt
    string unit
    string updatedAt
  }
  depots ||--o{ shipments : depotId
  drivers ||--o{ shipments : driverId
  vehicles ||--o{ shipments : vehicleId
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
| 1 | `auditEntries`, `depots`, `drivers`, `shipments`, `vehicles` | — | — |
<!-- /protoyard:generated:versions -->

## Migrations

TODO: what each `upgrade` does to existing rows.
