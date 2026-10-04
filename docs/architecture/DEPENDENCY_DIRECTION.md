# Monorepo Dependency Direction & Architecture Rules

## Governing Principle

The core architectural invariant is:
> **The domain is the core. Dependencies flow inward from external adapters, APIs, and UIs toward the domain. The domain has zero outward dependencies.**

```text
       ┌────────────────────────┐
       │       apps/web         │──┐
       └────────────────────────┘  │
       ┌────────────────────────┐  │
       │       apps/admin       │──┤───► packages/ui ───► packages/contracts
       └────────────────────────┘  │                             ▲
                                   │                             │
       ┌────────────────────────┐  │                             │
       │       apps/api         │──┴───► packages/security       │
       └────────────────────────┘  │            │                │
                   │               │            ▼                │
                   ▼               │      packages/domain ───────┤
       ┌────────────────────────┐  │            ▲
       │      apps/worker       │──┘            │
       └────────────────────────┘               │
                   │                            │
                   ├──► packages/database ──────┤
                   ├──► packages/integrations ──┤
                   └──► packages/observability
```

## Package Rules

1. **`@platform/domain`**:
   - Contains pure business logic, mathematical invariants of the inventory ledger, reservation rules, and order allocation policies.
   - **Allowed dependencies:** NONE. Pure TypeScript.
   - **Forbidden:** No database libraries, no HTTP frameworks, no UI libraries, no external provider SDKs.

2. **`@platform/contracts`**:
   - Contains request/response schemas (Zod), DTOs, event definitions, and error taxonomy.
   - **Allowed dependencies:** `@platform/domain`, `zod`.
   - **Forbidden:** No database access, no server implementations.

3. **`@platform/security`**:
   - Contains tenant context management, RBAC permission matrices, token decoding, and sanitization utilities.
   - **Allowed dependencies:** `@platform/contracts`, `@platform/domain`.

4. **`@platform/config`**:
   - Environment schema definitions and runtime validation using Zod.
   - **Allowed dependencies:** `zod`.

5. **`@platform/database`**:
   - Supabase PostgreSQL client configuration, connection poolers, migrations, schema definitions, and RLS helper policies.
   - **Allowed dependencies:** `@platform/config`, `@platform/domain`, `@platform/contracts`.

6. **`@platform/integrations`**:
   - Provider adapter contracts and clients (Shopify Admin GraphQL/REST, Amazon SP-API, Stripe Billing).
   - **Allowed dependencies:** `@platform/contracts`, `@platform/config`.

7. **`@platform/observability`**:
   - OpenTelemetry instrumentation wrappers, structured logger interface, metrics contracts.
   - **Allowed dependencies:** `@platform/config`.

8. **`@platform/ui`**:
   - Design tokens, accessible primitive components, Tailwind utility classes conforming to `02_PRODUCT_DESIGN_SPEC.md`.
   - **Allowed dependencies:** `@platform/contracts`.
   - **Forbidden:** Never import server-only packages (`@platform/database`, `@platform/security`, `@platform/integrations`). Never import secret credentials.

9. **`@platform/testing`**:
   - Test harnesses, mock builders, fixture generators.
   - **Allowed dependencies:** `@platform/domain`, `@platform/contracts`.

## Application Rules

1. **`apps/api` (REST API)**:
   - Implements application endpoints, request validation, authentication guard, and domain orchestration.
   - May depend on: `@platform/config`, `@platform/contracts`, `@platform/domain`, `@platform/database`, `@platform/security`, `@platform/observability`.

2. **`apps/worker` (BullMQ Background Worker)**:
   - Implements asynchronous synchronization, reconciliation routines, report generation, and queue processors.
   - May depend on: `@platform/config`, `@platform/contracts`, `@platform/domain`, `@platform/database`, `@platform/integrations`, `@platform/observability`, `@platform/security`.

3. **`apps/web` (Next.js Application)**:
   - Merchant-facing responsive web application.
   - May depend on: `@platform/config`, `@platform/contracts`, `@platform/ui`.
   - Client bundles MUST NEVER import `@platform/database` or server-only Supabase secret keys.

4. **`apps/admin` (Next.js Admin Console)**:
   - Internal platform administration and support console.
   - May depend on: `@platform/config`, `@platform/contracts`, `@platform/ui`.
