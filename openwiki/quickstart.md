---
type: quickstart
title: CasaSegura Backend Quickstart
description: Get the TypeScript Express backend running locally, configure its required services, and navigate its main systems.
tags: [quickstart, express, typescript, supabase, postgresql]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-05T03:32:47.137Z
sources:
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-91c4a3d292fb8cb1444147d2
    resource: repo://src/config/db.ts
  - id: openwiki-source-6bb2f0e9b362141dddd1938d
    resource: repo://src/config/supabase-admin.ts
  - id: openwiki-source-0c029fc734f4e8508de8d922
    resource: repo://src/config/supabase.ts
  - id: openwiki-source-d1fbef09192ffbab6eff0bc2
    resource: repo://src/index.ts
  - id: openwiki-source-01249f5a4660c0198dff51df
    resource: repo://src/routes/auth.routes.ts
  - id: openwiki-source-fbadcd8591b65031efaaedce
    resource: repo://vitest.config.ts
generated: { by: "codex", at: "2026-09-05T03:32:47.137Z" }
---

# CasaSegura Backend Quickstart

CasaSegura Backend is a TypeScript/Express API backed by PostgreSQL and Supabase. It exposes authentication plus tenant-scoped management endpoints for products, branch stock, operations, financial accounts, and replenishment workflows.

## Prerequisites and configuration

Install the repository's Node dependencies with:

```sh
npm install
```

Provide runtime environment values for:

- `SUPABASE_URL` and `SUPABASE_KEY` for the application Supabase client.
- `SUPABASE_SERVICE_ROLE_KEY` for administrative Supabase and Storage operations.
- `DB_URL` for the PostgreSQL connection pool.

Optional values are `PORT` (default `8080`) and `FRONTEND_URL` (the credentialed CORS origin, defaulting to `http://localhost:3000`). Do not commit actual keys or connection strings.

The repository includes a `supabase/` configuration with migrations and a seed script for local Supabase development. See [Configuration, Database, and Storage Operations](operations/database-and-configuration.md) before operating the database or Storage.

## Run, build, and test

```sh
npm run dev
npm test
npm run build
npm start
```

`npm run dev` watches `src/index.ts` with `tsx` and loads `.env`. The production path compiles TypeScript into `dist` and runs `dist/index.js`. Vitest uses test-only placeholder service settings, so its focused unit/controller tests do not require the supplied runtime credentials.

## First API flow

1. Start the service; it listens on `PORT` or 8080.
2. Authenticate with `POST /api/auth/login` using an email/password recognized by Supabase Auth. The server returns basic user data and sets an HTTP-only access-token cookie.
3. Call protected resource endpoints under `/api`, supplying that cookie or a bearer token. The middleware resolves the Supabase user, and controllers derive the tenant from the corresponding application user.

## Documentation map

- [Backend Architecture](architecture/backend-architecture.md): API layering, routing, and response/persistence boundaries.
- [Authentication and Tenant Isolation](security/authentication-and-tenancy.md): session lifecycle and the two tenant-scoping layers.
- [Domain Model and Persistence](data/domain-model.md): database entities, relationships, migrations, and RLS.
- [Operations, Inventory, and Financial Accounts](workflows/operations-and-inventory.md): the atomic purchase/sale/transfer/movement workflow.
- [Testing Strategy](testing/testing-strategy.md): what the current Vitest suite verifies and where integration coverage would help.
