---
type: security-guide
title: Authentication and Tenant Isolation
description: How CasaSegura authenticates Supabase sessions, transports tokens, resolves application users, and scopes data by tenant.
tags: [security, authentication, supabase, tenancy]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-05T03:32:47.137Z
sources:
  - id: openwiki-source-1d6c9ed6688f2d86140202a1
    resource: repo://src/config/cookie.ts
  - id: openwiki-source-6bb2f0e9b362141dddd1938d
    resource: repo://src/config/supabase-admin.ts
  - id: openwiki-source-d96959de32fb93a72f5bf390
    resource: repo://src/controllers/auth.controller.ts
  - id: openwiki-source-61fae7eb726bc4f804311817
    resource: repo://src/middlewares/auth.middleware.ts
  - id: openwiki-source-f41ee4f2b09ff5674d0cbd1d
    resource: repo://src/services/auth.service.ts
  - id: openwiki-source-0b6001220a5d00f22e60f387
    resource: repo://src/utils/tenant.ts
  - id: openwiki-source-b4da678cc4c59408dacffdda
    resource: repo://supabase/migrations/20260726000000_init_schema.sql
generated: { by: "codex", at: "2026-09-05T03:32:47.137Z" }
---

# Authentication and Tenant Isolation

CasaSegura separates external identity from application authorization context. Supabase Auth validates credentials and sessions; the backend maps the authenticated Supabase user to `public.usuario` to obtain the tenant used by application queries.

## Session lifecycle

`POST /api/auth/login` forwards email/password credentials to Supabase. On success the server sets the returned access token in the HTTP-only `access_token` cookie for the session lifetime and returns only the user's id and email. `POST /api/auth/logout` attempts Supabase administrative sign-out when a cookie token exists, clears the cookie even when remote sign-out fails, and returns success. `GET /api/auth/me` returns the user that middleware has already authenticated.

Cookie transport is configured for HTTP-only access. In production it uses `Secure` and `SameSite=None`; otherwise it uses `SameSite=Lax`. The server's credentialed CORS configuration must therefore be aligned with the browser frontend origin.

## Protecting requests

Resource routes attach `authMiddleware`. The middleware gives precedence to the cookie token, falling back to the second whitespace-delimited value from the `Authorization` header. It asks Supabase for the user and attaches the result as `req.user`. For Supabase authentication errors it clears a stale cookie when present and responds with 401; other middleware failures also produce 401.

The backend does not accept a client-provided tenant identifier as its scope. Controllers use the authenticated `req.user.id`, then `getTenantIdByAuthId` queries `public.usuario` by `auth_id`. A missing application user is an error rather than an unscoped request.

## Two layers of tenant isolation

At the application layer, repositories receive the derived tenant id and use it in queries and updates. For example, product lookups require both product id and tenant id, and updates have the same predicate.

At the database layer, the initial migration enables RLS and creates `current_tenant_id()` from `auth.uid()` via `public.usuario`. It applies direct policies to tenant-owned tables and relationship-based policies to child tables such as stock and operation details. This is defense in depth for Supabase roles; the direct `pg` backend pool still makes explicit tenant predicates essential.

## Administrative boundary

The regular Supabase client holds the application key and performs user sign-in/user lookup. The separate service-role client disables session persistence and automatic refresh, and is used for administrative sign-out plus Storage operations. Service-role credentials must remain server-only because the database policy grants that role broad access, including product-media writes.
