---
type: workflow-guide
title: Operations, Inventory, and Financial Accounts
description: Creation workflow for purchases, sales, transfers, and financial movements, including stock changes, account allocation, locking, and transaction boundaries.
tags: [workflow, inventory, operations, finance, transactions]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-05T03:32:47.137Z
sources:
  - id: openwiki-source-4834c1b0df505dab507e5380
    resource: repo://src/controllers/operacion.controller.ts
  - id: openwiki-source-ed42ad00c4900d3c7a11e763
    resource: repo://src/repositories/operacion.repository.ts
  - id: openwiki-source-b872fcdfd116febd82e0bb30
    resource: repo://src/repositories/pedido-reposicion.repository.ts
  - id: openwiki-source-85c5292f8c87ce8969efc8c1
    resource: repo://src/utils/db-transaction.ts
  - id: openwiki-source-d25dd7808da0cd1b6c38293c
    resource: repo://src/utils/reparto-cuentas.ts
generated: { by: "codex", at: "2026-09-05T03:32:47.137Z" }
---

# Operations, Inventory, and Financial Accounts

An operation is the system's atomic business write workflow. The API accepts a lowercase operation type (`compra`, `venta`, `traslado`, or `movimiento`), validates its required shape, resolves the caller's tenant and branch assignment, and creates the corresponding transaction records and effects in one PostgreSQL transaction.

## Request validation and authorization

The operations controller requires a known type and source branch. Purchases require a supplier; purchases, sales, and transfers require one or more positive-quantity product/branch items; transfers cannot use the source as destination; movements require an `ingreso` or `egreso` and payment accounts. Account entries must identify an account and provide either positive percentage values or positive amounts according to the selected allocation mode. Movements always use amount allocation.

Before persistence, the repository resolves `usuario_sucursal` using the authenticated Supabase id, requested branch, and tenant. A user without an assignment at that branch cannot create the operation.

## Atomic creation sequence

Inside `withTransaction`, the repository resolves the actor/branch, operation-type id, and account allocation; creates the generic operation header; adds product details when supplied; inserts the type-specific extension; stores resolved account allocations; then applies stock and balance effects. Any exception rolls back the entire sequence; only a successful callback commits. The repository then reads the scoped operation with its details and accounts for the response.

## Account allocation

Account surcharge percentages are read from tenant-owned `cuenta_financiera` rows, not trusted from client input. Percentage mode requires the allocations to sum to 100% (within a one-cent tolerance) and applies each account's surcharge to its share of the base. Amount mode treats entered amounts as surcharge-inclusive, derives the base portion, and requires the resolved bases to cover the operation base. The persisted allocation records include the resolved percentage, surcharge, and amounts.

For purchases, the base is the supplied total or subtotal; for sales it is subtotal less discount; for transfers it is freight; for movements it is derived from the submitted account amounts. This makes the movement total a consequence of the financial-account split rather than a separate arbitrary input.

## Type-specific effects

- **Purchase:** inserts the purchase extension, increases available stock for each item, and debits allocated account balances.
- **Sale:** checks configured minimum margin when enough pricing data exists, locks each stock record, rejects missing or insufficient stock, decreases available stock, and credits allocated account balances.
- **Transfer:** locks source and destination product/branch records, requires available source stock and a destination stock record, then decreases the source and increases the destination. Freight debits allocated accounts only when a freight cost is present.
- **Movement:** inserts the movement extension and credits accounts for `ingreso` or debits them for `egreso`.

The stock and account updates select rows `FOR UPDATE` before changing quantities/balances, which serializes concurrent writes to the same records within the transaction.

## Replenishment

Replenishment orders are a separate workflow linking a branch-stock record, supplier, requesting application user, quantity, status, source, and date. They can be listed and created through their own protected resource; they do not themselves perform the stock increment used by a purchase operation.

See [Domain Model and Persistence](../data/domain-model.md) for the resulting tables and [Testing Strategy](../testing/testing-strategy.md) for validation and allocation test coverage.
