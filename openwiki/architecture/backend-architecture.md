---
type: architecture
title: Backend Architecture
description: Overview of the CasaSegura Express API layers, route composition, request handling, and tenant-scoped persistence.
tags: [architecture, express, api, tenancy]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-05T03:32:47.137Z
sources:
  - id: openwiki-source-d1fbef09192ffbab6eff0bc2
    resource: repo://src/index.ts
  - id: openwiki-source-61fae7eb726bc4f804311817
    resource: repo://src/middlewares/auth.middleware.ts
  - id: openwiki-source-accf61b353440d5cd0f4de9e
    resource: repo://src/repositories/producto.repository.ts
  - id: openwiki-source-3b11d705c40e7c129de6e16f
    resource: repo://src/routes/producto.routes.ts
  - id: openwiki-source-2c95ed0d7197b28d23b563f2
    resource: repo://src/services/storage.service.ts
  - id: openwiki-source-0e3cab1cc6c96e0747e41af9
    resource: repo://src/utils/response.ts
  - id: openwiki-source-0b6001220a5d00f22e60f387
    resource: repo://src/utils/tenant.ts
generated: { by: "codex", at: "2026-09-05T03:32:47.137Z" }
---

# Backend Architecture

CasaSegura is a TypeScript Express backend for a tenant-scoped inventory and business-management domain. It starts a single HTTP server, applies common HTTP middleware, and mounts authentication plus resource routers beneath `/api`.

## Request path

The runtime follows a conventional boundary-to-data flow:

1. `src/index.ts` configures CORS, JSON-body parsing, and cookie parsing, then mounts routers.
2. Resource routes apply `authMiddleware` before controller handlers. Authentication routes expose login and logout publicly, while `/me` is protected.
3. Controllers validate request-specific inputs, obtain the caller's tenant from `req.user`, select pagination/response behavior, and translate known failures into HTTP responses.
4. Services provide a small domain-facing layer. Repositories contain PostgreSQL queries and apply the tenant identifier to reads and writes.

The API provides routes for products and per-branch stock, branches, suppliers, types/subtypes, roles, financial accounts, user/branch assignment, replenishment orders, and business operations. This keeps Express handlers thin while database-specific joins and mutation sequences stay in repositories.

## Authentication and scope

The authentication middleware accepts the session token from the configured cookie first and otherwise from a bearer Authorization header. It resolves the Supabase user and attaches it to `req.user`. Controllers then call `getTenantIdByAuthId`, which maps the Supabase identity to the application `usuario` record and its tenant before accessing tenant-owned data. See [Authentication and Tenant Isolation](../security/authentication-and-tenancy.md) for the full boundary.

## API conventions

`successResponse`, `errorResponse`, and `paginatedResponse` define the predominant JSON envelopes. Non-paginated successful responses use `{ status: "success", data }`; errors use `{ status: "error", message }`; cursor-style lists add `page.hasMore`. Controllers also support page/total pagination for selected list endpoints.

Controllers are responsible for visible request validation and status choices. They return `400` for malformed operation input or domain `BusinessError`s, `404` when a scoped entity cannot be found, and `500` for unexpected failures. Repository work uses parameterized `pg` queries rather than composing values into SQL.

## Important cross-cutting boundaries

- **Database access:** `src/config/db.ts` exports a shared `pg` pool used by repositories; multi-step mutations use `withTransaction` where atomicity matters.
- **Supabase access:** the regular Supabase client handles end-user authentication, while a service-role client is reserved for administrative authentication/storage work.
- **Media handling:** the product router accepts only selected image MIME types and a 5 MB in-memory upload; the service uploads using the tenant/product path before persisting the resulting public URL.
- **Inventory and financial effects:** operation creation is the primary multi-entity workflow. It coordinates operation headers/extensions, stock, payment-account allocations, and account balances. See [Operations, Inventory, and Financial Accounts](../workflows/operations-and-inventory.md).

## Extending the API

New resource behavior normally follows the existing route → controller → service → repository shape. A tenant-owned endpoint should be protected at the router, derive its tenant from the authenticated user rather than client input, and ensure repository predicates or inserts use that tenant. New cross-table mutations should use the transaction helper and preserve the domain checks near the persistence workflow.
