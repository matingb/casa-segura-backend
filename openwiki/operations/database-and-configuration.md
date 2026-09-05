---
type: operations-guide
title: Configuration, Database, and Storage Operations
description: Runtime configuration and operational boundaries for the Express service, PostgreSQL pool, Supabase clients, storage, migrations, and local Supabase setup.
tags: [operations, configuration, supabase, postgresql, storage]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-05T03:32:47.137Z
sources:
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-1d6c9ed6688f2d86140202a1
    resource: repo://src/config/cookie.ts
  - id: openwiki-source-91c4a3d292fb8cb1444147d2
    resource: repo://src/config/db.ts
  - id: openwiki-source-6bb2f0e9b362141dddd1938d
    resource: repo://src/config/supabase-admin.ts
  - id: openwiki-source-0c029fc734f4e8508de8d922
    resource: repo://src/config/supabase.ts
  - id: openwiki-source-d1fbef09192ffbab6eff0bc2
    resource: repo://src/index.ts
  - id: openwiki-source-2c95ed0d7197b28d23b563f2
    resource: repo://src/services/storage.service.ts
  - id: openwiki-source-d81538d8891efe37053aeccb
    resource: repo://supabase/config.toml
generated: { by: "codex", at: "2026-09-05T03:32:47.137Z" }
---

# Configuration, Database, and Storage Operations

The backend combines an Express process with two data integrations: a direct PostgreSQL `pg` pool for application repositories, and Supabase clients for authentication and product media. Keep credentials in environment configuration and out of source control.

## Required runtime settings

The normal Supabase client requires `SUPABASE_URL` and `SUPABASE_KEY`; the administrative client requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; the database pool requires `DB_URL`. Each module fails at startup if its required values are absent. `PORT` controls the HTTP listener and defaults to `8080`; `FRONTEND_URL` controls the credentialed CORS origin and defaults to the local frontend URL.

Authentication cookies use the fixed `access_token` name. They are HTTP-only; `secure` and `SameSite=None` are used in production, while development uses `SameSite=Lax`.

## Database access and migrations

Repositories use the shared `pg` `Pool` from `src/config/db.ts`. The schema and ordered migrations live in `supabase/migrations`; the local Supabase configuration enables migrations and loads `supabase/seed.sql` during database resets.

The local configuration exposes the Supabase API on port 54321 and the database on 54322, uses PostgreSQL major version 17, and starts Studio on port 54323. These settings are for the local Supabase environment; the Node service itself uses the supplied `DB_URL` rather than deriving a connection string from this file.

## Supabase clients and storage

The regular client is used for password sign-in and token user lookup. The service-role client disables persisted sessions and token auto-refresh, and is used for administrative sign-out and product storage work.

Product images are written to the `productos` bucket at `<tenantId>/<productoId>`, with upsert enabled. The service returns a public URL and the product repository persists that URL. The database migration makes the bucket publicly readable, while storage mutations are restricted to the `service_role`.

## Build and verification commands

`npm run dev` starts the TypeScript server through `tsx watch` and loads `.env`; `npm run build` compiles `src` into `dist`; `npm start` runs the compiled service. `npm test` runs the Vitest suite. See [CasaSegura Backend Quickstart](../quickstart.md) for the contributor workflow and [Domain Model and Persistence](../data/domain-model.md) for the schema these services operate against.
