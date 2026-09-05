---
type: domain-model
title: Domain Model and Persistence
description: Conceptual map of CasaSegura's tenant-scoped PostgreSQL schema, inventory model, operations, financial records, and product migrations.
tags: [database, postgresql, supabase, domain-model, inventory]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-05T03:32:47.137Z
sources:
  - id: openwiki-source-b4da678cc4c59408dacffdda
    resource: repo://supabase/migrations/20260726000000_init_schema.sql
  - id: openwiki-source-bfaa353406b57d9d552edf6b
    resource: repo://supabase/migrations/20260805000000_storage_productos.sql
  - id: openwiki-source-f6bb67ab8c97bc282ef7a8ce
    resource: repo://supabase/migrations/20260820000000_producto_precio_base_qr.sql
  - id: openwiki-source-f338a4dfa09682ef3a168ff6
    resource: repo://supabase/migrations/20260904000000_unidades_producto.sql
  - id: openwiki-source-56bd2b98f18bc3952235d693
    resource: repo://supabase/migrations/20260904165651_add_producto_costo_reposicion_base.sql
generated: { by: "codex", at: "2026-09-05T03:32:47.137Z" }
---

# Domain Model and Persistence

The application stores its operational data in PostgreSQL managed through Supabase. The initial migration establishes the schema; later migrations evolve the product catalog and its media support.

## Tenant and identity foundation

`tenant` is the top-level business boundary. Branches, users, roles, suppliers, product types, products, financial accounts, operations, and replenishment orders either contain `tenant_id` directly or are reached from a tenant-owned parent.

Supabase Auth users connect to the application-specific `usuario` row through `auth_id`. `usuario_sucursal` then models a user's assignment to a branch together with a role. This assignment is the actor/branch reference stored on every operation.

## Catalog and inventory

Product classification is `tipo` → `subtipo` → `producto`. A product belongs to one tenant, has a tenant-unique code, and holds catalog-level descriptive attributes. `producto_sucursal` is the per-branch inventory record: it links a product and branch uniquely and holds enablement, replenishment cost, selling prices, tax rate, minimum margin, and available/reserved/minimum stock.

This separation lets the same catalog product have different availability, costs, prices, and stock by branch. Suppliers are tenant-scoped, while `tipo_operacion` is a global catalog for Compra, Venta, Traslado, and Movimiento.

## Business records

`operacion` is a generic, tenant-owned transaction header associated with a `usuario_sucursal` and an operation type. Product lines live in `operacion_detalle`; payment/account allocations live in `operacion_cuenta`.

Each transaction type has a one-to-one extension table:

- `compra` adds supplier and invoice/remittance and totals.
- `venta` adds receipt, discount, and totals.
- `traslado` adds a destination branch and freight cost.
- `movimiento` records free-form financial inflow or outflow.

`cuenta_financiera` contains opening/current balances and a surcharge percentage. `pedido_reposicion` associates a branch-stock record, requesting user, supplier, quantity, status, origin, and timestamp to represent replenishment work.

## Isolation and integrity

The schema enables row-level security for the public tables and defines `current_tenant_id()` from `auth.uid()` through `usuario`. Tenant-owned tables have isolation policies based on their direct tenant id; child tables use parent relationships in their policies. Foreign keys and unique constraints establish core ownership and cardinality, including unique product codes per tenant and unique product/branch stock rows.

The backend also explicitly passes tenant ids into repository queries, so application queries are scoped even though server-side access uses a direct PostgreSQL pool. Details are in [Authentication and Tenant Isolation](../security/authentication-and-tenancy.md).

## Product evolution and media

The initial product table captured dimensions, mass, description, image URL, and activity state. Subsequent migrations add a branch-independent reference price and QR code; introduce dimension/weight enum units and normalize those numeric columns; and add a base replenishment cost. Product image files belong in the public `productos` storage bucket, which limits files to 5 MB and the supported image MIME types; writes are restricted to the Supabase `service_role`.

## Migrations and seed data

Schema changes are ordered SQL migrations in `supabase/migrations`. The seed script provisions a representative tenant, authenticated users, branches, roles, catalog data, products, stock, accounts, transaction examples, replenishment records, and additional test data for pagination. Treat those seed identities and credentials as local development fixtures rather than deployment configuration.
