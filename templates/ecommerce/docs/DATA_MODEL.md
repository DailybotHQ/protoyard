# Storefront: data model

## Overview

TODO: the domain in words, and why the model looks this way.

## Tables

<!-- protoyard:generated:tables -->
| Table | Primary key | Indexes |
| --- | --- | --- |
| `cartItems` | `id` (unique) | `customerId`, `productId` |
| `categories` | `id` (unique) | `slug` |
| `orderItems` | `id` (unique) | `orderId`, `productId` |
| `orders` | `id` (unique) | `customerId`, `number`, `placedAt`, `status` |
| `products` | `id` (unique) | `categoryId`, `featuredRank`, `name`, `priceCents`, `stock` |
<!-- /protoyard:generated:tables -->

## Diagram

<!-- protoyard:generated:er-diagram -->
```mermaid
erDiagram
  cartItems {
    string id PK
    string customerId
    string productId FK
  }
  categories {
    string id PK
    string slug
  }
  orderItems {
    string id PK
    string orderId FK
    string productId FK
  }
  orders {
    string id PK
    string customerId
    string number
    string placedAt
    string status
  }
  products {
    string id PK
    string categoryId FK
    string featuredRank
    string name
    string priceCents
    string stock
  }
  products ||--o{ cartItems : productId
  orders ||--o{ orderItems : orderId
  products ||--o{ orderItems : productId
  categories ||--o{ products : categoryId
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
| 1 | `cartItems`, `categories`, `orderItems`, `orders`, `products` | — | — |
<!-- /protoyard:generated:versions -->

## Migrations

TODO: what each `upgrade` does to existing rows.
