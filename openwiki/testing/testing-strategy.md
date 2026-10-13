---
type: testing-guide
title: Testing Strategy
description: How the CasaSegura backend uses Vitest for focused units and controller behavior, including mocks, fixtures, and covered business rules.
tags: [testing, vitest, unit-testing, controllers]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-05T03:32:47.137Z
sources:
  - id: openwiki-source-10e6219c6602b764e0fd0c00
    resource: repo://src/controllers/operacion.controller.test.ts
  - id: openwiki-source-41b452cfd2ff64f4dbbca843
    resource: repo://src/middlewares/auth.middleware.test.ts
  - id: openwiki-source-8fba96c6e9a1d678d032f281
    resource: repo://src/services/producto-sucursal.service.test.ts
  - id: openwiki-source-9e3135bf6cb51d3454bd3c1a
    resource: repo://src/utils/reparto-cuentas.test.ts
  - id: openwiki-source-fbadcd8591b65031efaaedce
    resource: repo://vitest.config.ts
  - id: openwiki-source-fa7e60e4d16a0910621fd6db
    resource: repo://vitest.setup.ts
generated: { by: "codex", at: "2026-09-05T03:32:47.137Z" }
---

# Testing Strategy

The repository uses Vitest for focused TypeScript tests colocated under `src` with the `.test.ts` suffix. `npm test` runs the suite once; `npm run test:watch` keeps Vitest running during development.

## Test environment

`vitest.config.ts` discovers `src/**/*.test.ts` and supplies placeholder Supabase and database environment values so configuration modules can load without real services. The shared setup spies on `console.error` before every test to keep expected error-path logging out of test output, and Vitest restores mocks between tests.

## Controller tests

Controller suites mock service classes and tenant helpers. They exercise the HTTP-facing decisions that do not need a database: request validation, tenant lookup behavior, pagination parameter handling, successful response status/envelopes, 404s, `BusinessError` translation, and generic 500 handling.

The operations controller is especially broad: it covers list/detail status behavior plus valid creation inputs for sales, purchases, transfers, and movements; required fields; branch validation; payment-allocation modes; and business-error responses. Product and replenishment controller tests use the same seam—mocked services and tenant functions—to test input and response contracts.

## Domain and utility tests

Pure utility tests cover pagination normalization and the limit-plus-one sentinel behavior. Payment allocation tests cover percentage and amount modes, account surcharges, rounding tolerance, incomplete totals, and dispatcher behavior. Product-branch service tests verify that a configured sale price satisfies the configured minimum margin and that an invalid price is rejected.

Authentication middleware tests mock `AuthService` and response helpers to cover no token, cookie token, bearer token, expired/invalid tokens, unexpected validation failures, and stale-cookie cleanup.

## Scope and gaps

This is primarily a unit and controller-layer suite: dependencies are mocked and no test configuration points at a disposable Supabase/PostgreSQL instance. It provides strong feedback on validation and calculation rules, but it does not by itself verify router wiring, actual SQL/RLS behavior, Supabase Auth, Storage, or the complete HTTP-to-database workflow. Changes to those boundaries should add integration coverage where practical.
