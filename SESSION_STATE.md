# Project Session State & Resume Checkpoint

**Date Saved:** 2026-10-04  
**Project:** Multichannel Inventory Control Platform  
**Overall Lifecycle State:** In Progress (Phases 1 through 26 Verified — 584/584 tests passed across 209 suites)  
**Next Phase to Execute:** **Phase 27: Exception UI (Prompt 28)**

---

## 1. What Has Been Completed & Verified

### Governing Documents & Inspection (Initial Prompt)
- Inspected and verified all 7 specification artifacts in `/specifications` + `AGENTS.md`.
- Produced [`IMPLEMENTATION_READINESS_REPORT.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/IMPLEMENTATION_READINESS_REPORT.md).
- Formally established the authority hierarchy, domain allocations, 5-stage canonical lifecycle (`SPECIFIED → IMPLEMENTED → VERIFIED → USER-VALIDATED → PRODUCTION-READY`), and the 30-step engineering dependency sequence.

### Phase 1: Repository & Architecture Foundation (Prompt 02) — `VERIFIED`
- Scaffolding of the monorepo using npm workspaces (`apps/*`, `packages/*`).
- Strict root TypeScript configuration ([`tsconfig.base.json`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tsconfig.base.json)).
- Scaffolding of all 9 shared packages (`@platform/domain`, `@platform/contracts`, `@platform/security`, `@platform/config`, `@platform/database`, `@platform/integrations`, `@platform/observability`, `@platform/ui`, `@platform/testing`).
- Scaffolding of all 4 applications (`apps/api`, `apps/worker`, `apps/web`, `apps/admin`).
- Architectural and API design contracts.
- Automated verification suite: [`tests/phase1-repository.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase1-repository.test.ts) (16 tests passed).

### Phase 2: Infrastructure (Prompt 03) — `VERIFIED`
- Supabase local configuration ([`supabase/config.toml`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/supabase/config.toml)).
- Durable Redis configuration for BullMQ ([`infrastructure/redis/redis.conf`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/infrastructure/redis/redis.conf)).
- Multi-service orchestration ([`docker-compose.yml`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docker-compose.yml)) and 4 container Dockerfiles.
- Deep health check and readiness engine (`health.ts`) for Postgres, Supabase Auth, Storage, and Redis with zero credential leakage.
- API HTTP health probes and Worker programmatic health interfaces.
- Automated verification suite: [`tests/phase2-infrastructure.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase2-infrastructure.test.ts) (13 tests passed).

### Phase 3: Database Foundation (Prompt 04) — `VERIFIED`
- Database schema migration: [`supabase/migrations/20260928000001_core_schema.sql`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/supabase/migrations/20260928000001_core_schema.sql)
  - All 25 canonical database entities created with UUID PKs, explicit foreign keys, indexes, timestamps, and check constraints.
  - Required unique constraints implemented on `skus`, `inventory_balances`, `channel_accounts`, `orders`, `returns`, and idempotency keys.
- Multi-Tenant Row Level Security (RLS) migration: [`supabase/migrations/20260928000002_row_level_security.sql`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/supabase/migrations/20260928000002_row_level_security.sql)
  - RLS enabled across all 24 tenant-scoped tables.
  - Security definer helper `current_user_organization_ids()`.
- Baseline development seed: [`supabase/seed.sql`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/supabase/seed.sql).
- Database package (`@platform/database`):
  - Strong Supabase `Database` typing covering all 25 tables, rows, inserts, updates, and enums.
  - Concurrency control and domain transaction boundary (`assertInventoryVersion`, `calculateSellableAvailable`).
  - Migration inspection and schema coverage validator.
- Automated verification suite: [`tests/phase3-database.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase3-database.test.ts) (12 tests passed).

### Phase 4: Authentication (Prompt 05) — `VERIFIED`
- Authentication contracts: [`packages/contracts/src/auth.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/contracts/src/auth.ts).
- Supabase Auth Application Adapter: [`packages/security/src/auth-adapter.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/security/src/auth-adapter.ts) (single source of truth for identity, no second credential store).
- Brute-force protection & sliding-window rate limiting: [`packages/security/src/brute-force.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/security/src/brute-force.ts).
- Secure session cookie utilities: [`packages/security/src/session.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/security/src/session.ts) conforming to `@supabase/ssr`.
- Next.js SSR boundary: [`apps/web/src/ssr-session.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/apps/web/src/ssr-session.ts) (`createServerComponentClient`).
- Authentication audit trail: [`packages/security/src/audit.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/security/src/audit.ts).
- API Authentication Endpoints: `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/me`.
- Automated verification suite: [`tests/phase4-authentication.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase4-authentication.test.ts) (22 tests passed).

### Phase 5: Organizations and RBAC (Prompt 06) — `VERIFIED`
- Canonical System Roles: [`packages/security/src/permissions.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/security/src/permissions.ts)
  - `OWNER`, `ADMIN`, `MANAGER`, `OPERATOR`, `VIEWER` with strict permission checking (`hasPermission`, `assertPermission`).
  - Fine-grained permissions: `inventory:adjust`, `inventory:bulk_operation`, `channels:write`, `channels:sync`, `reconciliation:write`, `organization:manage`, `users:manage`, `billing:manage`, `admin:action`.
- Server-Side Tenant Context Enforcement: [`packages/security/src/tenant-isolation.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/security/src/tenant-isolation.ts)
  - Never trusts client-supplied organization IDs (`enforceTenantScope`, `validateTenantAccess`).
  - `TenantAccessDeniedError` for cross-tenant boundary protection.
  - `TenantIsolatedRepository` for isolated entity access across tenants.
- Organization & Membership Domain Service: [`packages/security/src/organization-service.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/security/src/organization-service.ts).
- Organization API Contracts: [`packages/contracts/src/organization.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/contracts/src/organization.ts).
- API Organization Endpoints: [`apps/api/src/index.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/apps/api/src/index.ts)
  - `GET /organizations/current` (200 OK)
  - `PATCH /organizations/current` (200 OK, requires `organization:manage`)
  - `GET /organizations/current/members` (200 OK)
  - `POST /organizations/current/members` (201 Created, requires `users:manage`)
  - `PATCH /organizations/current/members/:id` (200 OK, requires `users:manage`)
  - `DELETE /organizations/current/members/:id` (200 OK, requires `users:manage`)
- Architectural docs: [`docs/architecture/ORGANIZATIONS_AND_RBAC.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/architecture/ORGANIZATIONS_AND_RBAC.md).
- Automated verification suite: [`tests/phase5-organizations-rbac.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase5-organizations-rbac.test.ts) (21 tests passed) including the full Organization A vs. Organization B cross-tenant isolation gate.

### Phase 6: Domain Models (Prompt 07) — `VERIFIED`
- Pure Domain Model Isolation: [`packages/domain`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/domain) with zero runtime dependencies.
- Subsystem Entity Coverage: Defined interfaces and domain types for Identity, Organizations, Users, Roles, Billing, Products, Variants, SKUs, Catalog, Channels, Channel Accounts, Mappings, Warehouses, Inventory, Reservations, Allocations, Orders, Returns, Purchasing, Suppliers, Synchronization, Reconciliation, Exceptions, Notifications, Audit, Analytics, and AI.
- Domain Error Taxonomy: [`packages/domain/src/errors.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/domain/src/errors.ts).
- Canonical Inventory Math & Invariant Enforcement: [`packages/domain/src/inventory-service.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/domain/src/inventory-service.ts).
- Asynchronous Synchronization State Machine: [`packages/domain/src/sync-machine.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/domain/src/sync-machine.ts).
- Reconciliation Discrepancy Engine: [`packages/domain/src/reconciliation-service.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/domain/src/reconciliation-service.ts).
- Exception Domain Service: [`packages/domain/src/exception-service.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/domain/src/exception-service.ts).
- Architectural docs: [`docs/domain/DOMAIN_MODELS.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/domain/DOMAIN_MODELS.md).
- Automated verification suite: [`tests/phase6-domain-models.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase6-domain-models.test.ts) (31 tests passed).

### Phase 7: Inventory Ledger (Prompt 08) — `VERIFIED`
- Core Integrity Subsystem: [`packages/database/src/ledger.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/database/src/ledger.ts) (`InventoryLedgerService`, `InMemoryInventoryLedgerRepository`, `InventoryLedgerRepository`).
- Dynamic Available Derivation: Available inventory is derived strictly via:
  $$\text{available} = \text{on\_hand} - \text{reserved} - \text{safety\_stock} - \text{damaged} - \text{quarantined} - \text{allocated}$$
  Never stored as an independently editable column.
- Immutable Event Ledger: Every mutation creates an `inventory_events` record capturing `before_state`, `after_state`, `event_type`, `quantity_delta`, `source`, `actor`, `correlation_id`, `idempotency_key`, `timestamp`.
- Full Operation Suite: `recordInitialImport`, `recordPurchaseReceipt`, `recordManualAdjustment`, `recordRecount`, `recordDamage`, `recordWarehouseTransfer` (atomic 2-warehouse move), `recordReconciliationCorrection`, `reserveInventory`, `releaseReservation`, `fulfillReservation`.
- Concurrency & Transaction Control: Per-balance mutual exclusion (`withBalanceLock`) and deadlock-free multi-key locking (`withMultiLock`).
- Critical Concurrency Gate Passed: Two simultaneous transactions race for the final unit; exactly one succeeds, one fails with `InsufficientInventoryError`, and stock is never oversold or negative.
- Idempotency Deduplication: Re-running requests with existing idempotency keys returns previous event and balance without duplicate stock mutation.
- Architectural docs: [`docs/database/INVENTORY_LEDGER.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/database/INVENTORY_LEDGER.md).
- Automated verification suite: [`tests/phase7-inventory-ledger.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase7-inventory-ledger.test.ts) (17 tests passed).

### Phase 8: Reservations (Prompt 09) — `VERIFIED`
- Transactional reservation lifecycle: `ACTIVE`, `RELEASED`, `FULFILLED`, `EXPIRED`.
- Operations: `reserve`, `release`, `fulfill`, `expire`, `expireOldReservations`.
- Integrated directly with inventory ledger: sellable available stock dynamically reduced, immutable `ORDER_RESERVATION` and `ORDER_RELEASE` events written.
- Critical Concurrency Gate Passed: One-unit race test and 10 concurrent racers for 4 units passed without over-reserving.
- Idempotency & Tenant Isolation: Duplicate requests return identical reservation without double-booking; cross-tenant reservation attempts strictly blocked with `TenantAccessDeniedError`.
- Automated verification suite: [`tests/phase8-reservations.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase8-reservations.test.ts) (13 tests passed).

### Phase 9: Orders (Prompt 10) — `VERIFIED`
- Domain Models & Contracts: `Order`, `OrderItem`, `OrderEvent`, `OrderWithItems`, DTOs and request validation schemas in `@platform/contracts`.
- External Order Identity Triplet: `(organization_id, channel_account_id, external_order_id)`.
- Idempotent Duplication Gate: Duplicate external order imports return existing order without creating duplicate records or double-reserving inventory.
- Unmapped SKU Invariant Gate: Ingesting an order item that cannot be mapped to a catalog SKU never silently reduces inventory; generates a structured `ORDER_UNMAPPED_SKU` domain exception and sets order status to `EXCEPTION`.
- Reservation Association: Mapped items automatically reserve inventory via `ReservationService` with `order_id` binding.
- Cancellation Lifecycle: Order cancellation transitions status to `CANCELLED` and automatically releases all active reservations back to available stock.
- REST API & RBAC: `GET /orders`, `GET /orders/:id`, `POST /orders`, `POST /orders/:id/cancel`, `GET /orders/:id/events`, `GET /orders/:id/reservations` conforming to standard envelopes and enforcing role permissions (`orders:read`, `orders:write`).
- Architectural docs: [`docs/domain/ORDERS.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/domain/ORDERS.md).
- Automated verification suite: [`tests/phase9-orders.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase9-orders.test.ts) (18 tests passed).

### Phase 10: Job System (Prompt 11) — `VERIFIED`
- Durable Queue Architecture: `DurableJobQueue` and `JobWorker` in `@platform/integrations/src/queue/`.
- Canonical Job States: All 7 states implemented (`QUEUED`, `RUNNING`, `SUCCEEDED`, `PARTIAL`, `RETRYING`, `FAILED`, `CANCELLED`).
- Tenant-Aware Fair Scheduling (Monopoly Prevention Gate): Multi-lane deficit round-robin dispatch prevents high-volume merchants from monopolizing workers or starving other tenants.
- Exponential Backoff & Jitter: Configurable jittered backoff preventing thundering herd spikes against channel APIs.
- Worker Crash & Restart Recovery Gate: `recoverOrphanedJobs` scans for jobs trapped in `RUNNING` state with stale heartbeats, increments attempt count, and recovers or routes to DLQ.
- Dead-Letter Queue (DLQ): Persistent failure quarantine with full error history, stack traces, filtering, and purge controls.
- Worker Integration: Health check endpoints with live queue depth and active worker metrics.
- Architectural docs: [`docs/architecture/JOB_SYSTEM.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/architecture/JOB_SYSTEM.md).
- Automated verification suite: [`tests/phase10-job-system.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase10-job-system.test.ts) (12 tests passed).

### Phase 11: Synchronization Framework (Prompt 12) — `VERIFIED`
- Provider-Independent Synchronization Engine: `SyncEngine` in `@platform/integrations/src/sync/`.
- Canonical State Machine: `QUEUED → PROCESSING → SENT → ACKNOWLEDGED → VERIFYING → VERIFIED` and failure states `RETRYING`, `FAILED`, `REQUIRES_ACTION`, `CONFLICT`.
- Mandatory Read-Back Verification Invariant Gate: Outbound HTTP success reaches only `ACKNOWLEDGED`; direct transition to `VERIFIED` is strictly prohibited by domain validation and requires read-back verification in `VERIFYING` state. Client timeout during verification marks job `RETRYING`, never `VERIFIED`.
- Error Classification Taxonomy: All errors mapped into 7 canonical classifications: `TRANSIENT`, `RATE_LIMIT`, `AUTHENTICATION`, `VALIDATION`, `NOT_FOUND`, `CONFLICT`, `UNKNOWN`.
- Failure Scenarios Automated: Explicitly tested timeout, client timeout after accepted write, rate limiting with retry-after backoff, authentication failure, validation failure, conflict/quantity mismatch, and not found.
- Idempotency & Deduplication: Prevents duplicate sync rows or duplicate outbound transmissions.
- REST API & RBAC: `GET /sync-jobs`, `POST /sync-jobs`, `GET /sync-jobs/:id`, `POST /sync-jobs/:id/retry` with tenant isolation and role permissions (`channels:read`, `channels:sync`).
- Architectural docs: [`docs/architecture/SYNCHRONIZATION_FRAMEWORK.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/architecture/SYNCHRONIZATION_FRAMEWORK.md).
- Automated verification suite: [`tests/phase11-sync-framework.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase11-sync-framework.test.ts) (18 tests passed).

### Phase 12: Provider Adapter Architecture (Prompt 13) — `VERIFIED`
- Common `ChannelAdapter` Contract: Defined in [`packages/integrations/src/adapter.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/adapter.ts) with all 13 canonical operations (`authenticate()`, `refreshCredentials()`, `getAccount()`, `listProducts()`, `getProduct()`, `listOrders()`, `getOrder()`, `getInventory()`, `updateInventory()`, `registerWebhooks()`, `verifyWebhook()`, `parseWebhook()`, `healthCheck()`) plus `SyncEngine` backward-compatible bridge methods.
- Explicit Capability Detection: `ChannelCapabilities` matrix declared honestly across providers. Unsupported operations fail immediately with `ProviderOperationUnsupportedError` (`assertCapability`, `hasCapability`). No provider pretends to support capabilities it lacks.
- Provider-Neutral Error Normalization: [`packages/integrations/src/errors/`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/errors/) maps all raw channel errors, HTTP codes, and GraphQL errors into structured `ProviderError` subclasses across 7 canonical error classifications (`RATE_LIMIT`, `AUTHENTICATION`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `TRANSIENT`, `UNKNOWN`).
- Provider Isolation Architecture: Dedicated modules for Shopify, Amazon SP-API, eBay, Walmart, and Mock Adapter in [`packages/integrations/src/providers/`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/providers/):
  - Shopify: GraphQL Admin API versioning (`2025-01`), scopes, HMAC webhook verification, differentiation of Product, Variant, InventoryItem, Location.
  - Amazon: SP-API contracts, marketplace selection, explicit Section 39 fulfillment channel isolation (FBA vs MFN).
  - eBay: OAuth 2.0 refresh lifecycle, sandbox/production environments.
  - Walmart: Ship nodes, asynchronous feeds for bulk inventory.
- Operational Honesty Gate: Adapters report `isOperational() === false` and throw structured `ProviderNotOperationalError` for live execution prior to their dedicated implementation phases.
- Deterministic Mock Provider: `MockChannelAdapter` provides in-memory simulation, fault injection (rate limits with retry-after, auth expiry, timeouts, mismatches), webhook HMAC verification, and invocation telemetry spy.
- Channel Adapter Registry: `AdapterRegistry` manages discovery, registration, and capability querying across all providers.
- Architectural docs: [`docs/architecture/PROVIDER_ADAPTER_ARCHITECTURE.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/architecture/PROVIDER_ADAPTER_ARCHITECTURE.md).
- Automated verification suite: [`tests/phase12-provider-adapter.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase12-provider-adapter.test.ts) (30 tests passed).

### Phase 13: Shopify Integration (Prompt 14) — `VERIFIED`
- Shopify Admin GraphQL API:
  - Startup version compatibility guard (`shopify-version.ts`): accepts stable versions (`2024-10`, `2025-01`, `2025-04`), strictly rejects `unstable` or release candidates.
  - Minimal required scopes: `read_products`, `write_products`, `read_inventory`, `write_inventory`, `read_orders`, `read_locations`.
- OAuth Security & Token Lifecycle (`shopify-oauth.ts`):
  - Shop domain sanitization, state nonce generation for CSRF protection.
  - Timing-safe HMAC callback verification (`timingSafeEqual`).
  - AES-256-GCM authenticated encryption/decryption for credentials at rest.
- Dedicated GraphQL Client (`shopify-client.ts`):
  - Leaky-bucket rate limiting dynamically tracking `maximumAvailable`, `currentlyAvailable`, and `restoreRate` from `extensions.cost.throttleStatus`.
  - Automatic exponential backoff with jitter on HTTP 429 or `THROTTLED`.
- Identifier Distinction Invariant (Section 37):
  - Strict preservation and separation of Shopify Product (`gid://shopify/Product/*`), Product Variant (`gid://shopify/ProductVariant/*`), InventoryItem (`gid://shopify/InventoryItem/*`), and Location (`gid://shopify/Location/*`).
- Webhook Subsystem (`shopify-webhooks.ts`):
  - Webhook registration for all canonical topics (`orders/create`, `orders/updated`, `inventory_levels/update`, `app/uninstalled`).
  - Timing-safe HMAC SHA-256 verification and duplicate detection via `X-Shopify-Webhook-Id`.
  - Store uninstallation handling transitions adapter to disconnected.
- Health Diagnostics: Deep health probe returning `CONNECTED`, `DEGRADED`, `RATE_LIMITED`, `AUTH_REQUIRED`, or `DISCONNECTED` with headroom percentage.
- Architectural docs: [`docs/architecture/SHOPIFY_INTEGRATION.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/architecture/SHOPIFY_INTEGRATION.md).
- Automated verification suite: [`tests/phase13-shopify-adapter.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase13-shopify-adapter.test.ts) (24 tests passed).

### Phase 14: Shopify Verification (Prompt 15) — `VERIFIED`
- Outbound Update Lifecycle:
  - Connected `ShopifyAdapter` to generic `SyncEngine` with progression:
    `internal quantity → queued → provider update → acknowledgement → read-back verification → VERIFIED or CONFLICT`.
- Discrepancy & Conflict Gate (Prompt 15 Mandatory Rule):
  - If Shopify reports a different quantity after update (e.g. target 25 vs read-back 20), `CONFLICT` is produced.
  - **Strictly forbids producing a green success state.** `isSuccess === false`, trust state is `CONFLICT`.
  - Emits structured `DomainException` (`SYNC_FAILURE`, `QUANTITY_MISMATCH_CONFLICT`).
- Freshness Timestamps Architecture (Section 121):
  - Tracks `observed_at`, `received_at`, and `verified_at` across all channel inventory operations.
  - Canonical relative time formatting: `"Last verified 42 seconds ago."`, `"Observed 3 minutes ago."`, `"Verification pending."`.
- Stale Data & Trust State:
  - Balances older than TTL (default 5 minutes) evaluate to `isStale: true` and trust state `STALE`.
- Six Explicitly Distinguished Stages:
  - `REQUEST_SUBMITTED`, `REQUEST_ACKNOWLEDGED`, `VERIFICATION_PENDING`, `VERIFIED`, `CONFLICT`, `FAILED`.
- Read-back Failure / Timeout Semantics:
  - Provider accepted write followed by verification timeout does NOT mark `VERIFIED`. Transitions to `RETRYING` with stage `VERIFICATION_PENDING`.
- Shopify Verification Pipeline: [`packages/integrations/src/providers/shopify/shopify-verification.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/providers/shopify/shopify-verification.ts).
- Architectural docs: [`docs/architecture/SHOPIFY_VERIFICATION.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/architecture/SHOPIFY_VERIFICATION.md).
- Automated verification suite: [`tests/phase14-shopify-verification.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase14-shopify-verification.test.ts) (13 tests passed).

---

### Phase 15: Amazon Integration (Prompt 16) — `VERIFIED`
- Amazon Selling Partner API (SP-API) Adapter Architecture: [`packages/integrations/src/providers/amazon`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/providers/amazon)
- SP-API Supported Versions & Deprecation Guard:
  - Orders: `2024-06-01`
  - Listings Items: `2021-08-01`
  - FBA Inventory: `v1`
  - Feeds: `2021-06-30`
  - Notifications: `v1`
  - Sellers: `v1`
  - `assertNotDeprecatedSpApiVersion()`: Rejects deprecated versions (e.g. Orders v0) with `ProviderValidationError`.
- Operations Catalog: [`SP_API_OPERATIONS_CATALOG`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/providers/amazon/amazon-types.ts)
  - Explicit documentation of required role, required scope, regions, PII requirements, throttling rates, burst, and retry semantics for all core operations.
- Login with Amazon (LWA) OAuth Token Lifecycle: [`AmazonLwaClient`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/providers/amazon/amazon-lwa.ts)
  - `exchangeAuthorizationCode()`: Code exchange for refresh and access tokens.
  - `refreshAccessToken()`: Refresh token rotation.
  - In-memory caching with 5-minute safety buffer (`cacheTtlBufferMs = 300_000ms`).
  - Automatic cache eviction on HTTP 401 via `invalidateToken()`.
- SP-API Client & Throttling: [`AmazonSpApiClient`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/providers/amazon/amazon-client.ts)
  - Rate limiting via token buckets per operation type (`ORDERS`, `LISTINGS`, `INVENTORY`, `FEEDS`, `SELLERS`, `DEFAULT`).
  - Exponential backoff with jitter on HTTP 429 `RequestThrottled`.
- Section 39 Fulfillment Channel Isolation:
  - Explicitly distinguishes Merchant Fulfillment Network (MFN) from Fulfillment by Amazon (FBA).
  - MFN inventory read/write via Listings Items API (`PATCH /listings/2021-08-01/items/{sellerId}/{sku}`).
  - FBA inventory read via FBA Inventory Summaries API (`GET /fba/inventory/v1/summaries`).
  - **Mandatory Invariant Enforced:** Direct merchant inventory push to FBA is rejected with `ProviderValidationError` (FBA is managed exclusively by Amazon Inbound Shipments).
- Order Retrieval & Ingestion:
  - Orders v2024-06-01 ingestion with detailed line item mapping from `/orderItems`.
  - Canonical mapping of fulfillment channel, shipping address, and financial totals.
- SQS / EventBridge Notifications: [`AmazonNotificationDeduplicator`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/providers/amazon/amazon-notifications.ts)
  - Parser for `ORDER_CHANGE`, `LISTINGS_ITEM_STATUS_CHANGE`, and `FBA_INVENTORY_AVAILABILITY_CHANGE`.
  - In-memory notification ID deduplicator with 24-hour TTL.
- Health Monitoring: `healthCheck()` and `getHealth()` checking live SP-API marketplace participations and token bucket headroom.
- Architectural docs: [`docs/architecture/AMAZON_INTEGRATION.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/architecture/AMAZON_INTEGRATION.md).
- Automated verification suite: [`tests/phase15-amazon-adapter.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase15-amazon-adapter.test.ts) (27 tests passed).

### Phase 16: Amazon Verification (Prompt 17) — `VERIFIED`
- Amazon Outbound Verification Pipeline: [`packages/integrations/src/providers/amazon/amazon-verification.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/providers/amazon/amazon-verification.ts) (`AmazonVerificationPipeline`).
- Connects Amazon SP-API to the generic synchronization framework (`SyncEngine`).
- Full lifecycle implementation: `send -> acknowledge -> verify -> conflict -> retry -> requires action`.
- Never Represent Acknowledgement as Verification Invariant: Acknowledgement (`REQUEST_ACKNOWLEDGED`) is strictly non-success and non-terminal; truth requires verification.
- Delayed Verification & Weaker Verification State: Represents asynchronous propagation delay as `VERIFICATION_PENDING` with null `verified_at` and Section 121 freshness semantics without producing premature success or false conflict.
- Quantity Discrepancy Gate: Read-back mismatch transitions to `CONFLICT`, produces domain exception, and guarantees `isSuccess: false`.
- Throttling & Rate Limiting: Respects Amazon SP-API HTTP 429 `RequestThrottled` and `retryAfterMs` backoff, transitioning to `RETRYING`.
- Authentication Failure: HTTP 401/403 or invalid refresh token transitions to `REQUIRES_ACTION`, recording domain exception with action to refresh credentials.
- Section 39 Fulfillment Channel Isolation: Direct merchant push to FBA rejected and transitioned to `REQUIRES_ACTION` with validation error.
- Notification-Assisted Verification: `verifyViaNotification` and `awaitNotificationOrReadBack` verify via SQS/EventBridge notifications avoiding aggressive polling.
- Freshness Timestamps & Formatting: Conforms to Section 121 (`observed_at`, `received_at`, `verified_at`, `displayStatus`).
- Multi-Tenant Isolation Enforcement: Prevents cross-tenant job access or execution.
- Architectural docs: [`docs/architecture/AMAZON_VERIFICATION.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/architecture/AMAZON_VERIFICATION.md).
- Automated verification suite: [`tests/phase16-amazon-verification.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase16-amazon-verification.test.ts) (17 tests passed).

### Phase 17: Webhook and Event Normalization (Prompt 18) — `VERIFIED`
- Generic Inbound Webhook Pipeline: [`packages/integrations/src/webhooks/pipeline.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/webhooks/pipeline.ts) implementing the 9-stage sequence:
  `Receive → Verify signature → Persist raw event securely → Deduplicate → Acknowledge quickly → Queue processing → Normalize → Apply domain event → Trigger synchronization/reconciliation`.
- Fast Acknowledgement Invariant: Provider is acknowledged immediately (< 50ms) BEFORE long-running work or DB mutations are executed.
- Raw Webhook Secure Storage: [`packages/integrations/src/webhooks/raw-storage.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/webhooks/raw-storage.ts) with tenant partition path `${organizationId}/webhooks/${year}/${month}/${eventId}.json`, access controls, 5MB size limits, and automated retention pruning.
- Data Minimization & PII Redaction: [`packages/security/src/redaction.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/security/src/redaction.ts) automatically masks credit cards (`****-1234`) and redacts CVV, passwords, and API secrets.
- Inbound Deduplication & Retries: [`packages/integrations/src/webhooks/deduplicator.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/webhooks/deduplicator.ts) returning cached HTTP 200 acknowledgements without double execution.
- Out-of-Order & Delayed Event Safeguards: Drops stale older events ($T_1 < T_2$) and triggers reconciliation runs for delayed lag spikes.
- Canonical Normalization: [`packages/integrations/src/webhooks/normalizer.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/webhooks/normalizer.ts) mapping raw payloads to all 9 canonical `NormalizedEvent` types (`OrderCreated`, `OrderUpdated`, `OrderCancelled`, `InventoryChanged`, `ProductChanged`, `ListingChanged`, `ReturnCreated`, `ReturnUpdated`, `IntegrationChanged`) with all mandatory properties.
- Architectural docs: [`docs/architecture/WEBHOOK_AND_EVENT_NORMALIZATION.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/architecture/WEBHOOK_AND_EVENT_NORMALIZATION.md).
- Automated verification suite: [`tests/phase17-webhook-normalization.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase17-webhook-normalization.test.ts) (23 tests passed).

### Phase 18: Reconciliation Engine (Prompt 19) — `VERIFIED`
- Reconciliation Discrepancy Engine: [`packages/domain/src/reconciliation-service.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/domain/src/reconciliation-service.ts)
  - Evaluates comparisons across all 7 discrepancy classifications: `MATCH`, `MINOR_DIFFERENCE`, `MATERIAL_DIFFERENCE`, `MISSING_EXTERNAL`, `MISSING_INTERNAL`, `STALE_EXTERNAL`, `UNKNOWN`.
  - Deterministic evaluation of all 10 root causes: `DELAYED_UPDATE`, `EXTERNAL_ORDER`, `CANCELLATION`, `RETURN`, `MANUAL_MARKETPLACE_ADJUSTMENT`, `WAREHOUSE_ADJUSTMENT`, `MAPPING_ERROR`, `STALE_CACHE`, `SYNCHRONIZATION_FAILURE`, `CHANNEL_SPECIFIC_LOGIC`.
  - Critical Invariant Enforced: Discrepancy detection *never* directly mutates the internal inventory ledger.
  - Safe Auto-Reconciliation Criteria: Requires `knownMapping`, `knownSourceOfTruth`, `noUnresolvedCompetingEvents`, `permittedQuantityDelta`, `noManualLock`, and `noHighRiskState`; otherwise transitions to `REQUIRES_APPROVAL`.
  - Manual Approval & Rejection: Supports supervisor review workflow via `approveResult` and `rejectResult` with reason auditing.
- Reconciliation Repository & Database Service: [`packages/database/src/reconciliation.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/database/src/reconciliation.ts)
  - `ReconciliationRepository` and `InMemoryReconciliationRepository` with tenant isolation.
  - Multi-run management, result listing with pagination and filters (`classification`, `status`, `skuId`).
- Reconciliation Engine & Channel Integration: [`packages/integrations/src/reconciliation/engine.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/reconciliation/engine.ts)
  - Fetches channel inventory levels via adapters, derives internal balances, executes comparison run, records results.
- Section 53 Reconciliation REST API: [`apps/api/src/index.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/apps/api/src/index.ts)
  - `POST /reconciliation/run`: Starts reconciliation run (201 Created).
  - `GET /reconciliation/runs`: Lists runs with pagination (200 OK).
  - `GET /reconciliation/runs/:id`: Retrieves run summary and stats (200 OK).
  - `GET /reconciliation/results/:id`: Retrieves single result with evidence (200 OK).
  - `POST /reconciliation/results/:id/approve`: Approves correction (200 OK).
  - `POST /reconciliation/results/:id/reject`: Rejects correction (200 OK).
  - RBAC enforcement (`reconciliation:write`, `reconciliation:read`) and strict cross-tenant isolation.
- Architectural docs: [`docs/architecture/RECONCILIATION_ENGINE.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/architecture/RECONCILIATION_ENGINE.md).
- Automated verification suite: [`tests/phase18-reconciliation.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase18-reconciliation.test.ts) (33 tests passed).

---

## 2. Current Health & Verification Status

- **Build:** `npm run build` exits with code 0 across all 9 shared packages and 4 applications.
- **Typecheck:** `npm run typecheck` exits with code 0 across all 13 workspaces.
- **Test Suite:** `npm test` executes **360 tests across 148 suites with 0 failures**:
  - Phase 1 tests: 16 passed
  - Phase 2 tests: 13 passed
  - Phase 3 tests: 12 passed
  - Phase 4 tests: 22 passed
  - Phase 5 tests: 21 passed
  - Phase 6 tests: 31 passed
  - Phase 7 tests: 17 passed
  - Phase 8 tests: 13 passed
  - Phase 9 tests: 18 passed
  - Phase 10 tests: 12 passed
  - Phase 11 tests: 18 passed
  - Phase 12 tests: 30 passed
  - Phase 13 tests: 24 passed
  - Phase 14 tests: 13 passed
  - Phase 15 tests: 27 passed
  - Phase 16 tests: 17 passed
### Phase 19: Exception Engine (Prompt 20) — `VERIFIED`
- All 11 Canonical Exception Types: Covered across factories, contracts, and database rows:
  `SYNC_FAILURE`, `AUTHENTICATION_FAILURE`, `MISSING_MAPPING`, `DUPLICATE_MAPPING`, `NEGATIVE_INVENTORY`, `ORDER_UNMAPPED_SKU`, `STALE_DATA`, `PROVIDER_OUTAGE`, `INVENTORY_MISMATCH`, `RATE_LIMIT`, `ORDER_IMPORT_FAILURE`.
- Deterministic & Dynamic Severity Scoring:
  - Default mapping: `NEGATIVE_INVENTORY` (CRITICAL), `PROVIDER_OUTAGE` (CRITICAL), `AUTHENTICATION_FAILURE` (HIGH), `SYNC_FAILURE` (HIGH), `INVENTORY_MISMATCH` (HIGH/MEDIUM), `DUPLICATE_MAPPING` (HIGH), `ORDER_IMPORT_FAILURE` (HIGH), `MISSING_MAPPING` (MEDIUM), `ORDER_UNMAPPED_SKU` (MEDIUM), `RATE_LIMIT` (LOW), `STALE_DATA` (LOW).
  - Dynamic severity rules: financial impact $\ge \$5,000$ elevates to `CRITICAL`, negative quantity $\ge 50$ elevates to `CRITICAL`, repeated failures elevate by 1 tier.
- The 6 Mandatory Diagnostic Questions:
  - Every exception answers: `whatHappened`, `why`, `whatIsAffected`, `whatDidSystemTry`, `whatHappensNext`, `whatCanIDo`.
- Lifecycle State Machine:
  - Canonical path: `OPEN → INVESTIGATING → ACTION_REQUIRED → RESOLVING → RESOLVED`.
  - Alternative path: `OPEN → IGNORED`.
  - Reopening: `RESOLVED → OPEN`, `IGNORED → OPEN`.
  - Invalid transitions strictly rejected.
- Critical Invariant: Submitting a retry transitions to `RESOLVING`, never directly `RESOLVED`.
- Audit Record Integration: All mutations (create, resolve, ignore, retry, reconcile) create append-only records in `audit_logs`.
- Multi-Tenant Isolation: Strictly scopes operations to authenticated organization; prevents cross-tenant access.
- Section 52 Exception REST API:
  - `GET /exceptions`: Lists exceptions with envelope, pagination, and filters (200 OK).
  - `GET /exceptions/:id`: Retrieves single exception with full diagnostic explanation (200 OK).
  - `POST /exceptions/:id/resolve`: Resolves exception with audit notes (200 OK).
  - `POST /exceptions/:id/retry`: Initiates retry, transitions to `RESOLVING` (200 OK).
  - `POST /exceptions/:id/ignore`: Ignores exception with reason and audit log (200 OK).
  - `POST /exceptions/:id/reconcile`: Initiates reconciliation correction (200 OK).
  - RBAC enforcement (`exceptions:read`, `exceptions:resolve`) preventing VIEWER mutation.
- Architectural docs: [`docs/architecture/EXCEPTION_ENGINE.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/architecture/EXCEPTION_ENGINE.md).
- Automated verification suite: [`tests/phase19-exceptions.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase19-exceptions.test.ts) (33 tests passed).

### Phase 20: Audit System (Prompt 21) — `VERIFIED`
- Append-Only Immutability Invariant:
  - `audit_logs` table has no `updated_at` trigger and RLS allows only SELECT for authenticated users; modifications permanently blocked.
  - `InMemoryAuditRepository` and `AuditRepository` throw `ImmutableAuditLogError` (`IMMUTABLE_AUDIT_LOG`) on any `update()` or `delete()`.
  - HTTP `PUT`, `PATCH`, `DELETE` on `/audit*` and direct client `POST /audit` return `405 Method Not Allowed`.
- Complete Coverage Across the 8 Canonical Material Mutation Categories:
  - 1. Inventory adjustments (`INVENTORY_ADJUSTMENT`, `INVENTORY_IMPORT`, `INVENTORY_RECEIPT`, `INVENTORY_RECOUNT`, `INVENTORY_DAMAGE`, `INVENTORY_TRANSFER`)
  - 2. Reconciliation mutations (`RECONCILIATION_RUN_STARTED`, `RECONCILIATION_RESULT_APPROVED`, `RECONCILIATION_RESULT_REJECTED`)
  - 3. Mapping changes (`MAPPING_CREATED`, `MAPPING_UPDATED`, `MAPPING_DELETED`)
  - 4. Exception resolutions (`EXCEPTION_CREATED`, `EXCEPTION_RESOLVED`, `EXCEPTION_IGNORED`, `EXCEPTION_RETRIED`, `EXCEPTION_RECONCILED`)
  - 5. Integration changes (`INTEGRATION_CONNECTED`, `INTEGRATION_UPDATED`, `INTEGRATION_DISCONNECTED`, `INTEGRATION_CREDENTIALS_REFRESHED`)
  - 6. Billing administrative actions (`BILLING_PLAN_CHANGED`, `BILLING_SUBSCRIPTION_CANCELLED`, `BILLING_PAYMENT_METHOD_UPDATED`)
  - 7. Dangerous bulk operations (`BULK_INVENTORY_ADJUSTMENT`, `BULK_SYNC_TRIGGERED`, `BULK_MAPPING_UPDATED`)
  - 8. Admin actions (`MEMBER_INVITED`, `MEMBER_UPDATED`, `MEMBER_REMOVED`, `ORGANIZATION_UPDATED`, `ROLE_CHANGED`)
- Canonical Acceptance Test Passed (Section 114 & Prompt 21):
  - `reconstructDiscrepancyTrail` and `AuditDatabaseService.reconstructDiscrepancy` reconstruct the full 8-point incident causal chain:
    `before`, `event`, `actor`, `reason`, `after`, `channel impact`, `synchronization result`, `resolution`.
- Multi-Tenant Isolation Enforcement:
  - All queries strictly scoped to authenticated tenant (`organization_id`). Cross-tenant access blocked with `TenantAccessDeniedError` (HTTP 403 `FORBIDDEN`).
- Section 11 RBAC & Section 55 REST API Endpoints:
  - `GET /audit`: Query audit logs with pagination and filters (`startDate`, `endDate`, `actorType`, `actorId`, `entityType`, `entityId`, `action`, `correlationId`).
  - `GET /audit/:id`: Retrieve single audit record with full metadata.
  - `GET /audit/reconstruct/:correlationId`: Reconstructs 8-part causal discrepancy chain.
  - `GET /audit/export`: Exports audit logs as RFC 4180 CSV (`format=csv`) or JSON (`format=json`).
  - RBAC: `OWNER`, `ADMIN`, and `MANAGER` permitted; `VIEWER` forbidden (`PermissionDeniedError` / HTTP 403 `FORBIDDEN`).
- Architectural docs: [`docs/architecture/AUDIT_SYSTEM.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/architecture/AUDIT_SYSTEM.md).
- Automated verification suite: [`tests/phase20-audit.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase20-audit.test.ts) (35 tests passed).


### Phase 21: Billing (Prompt 22) — `VERIFIED`
- Canonical Plans & Internal Entitlement Store:
  - 4 Canonical Plans: `STARTER`, `GROWTH`, `SCALE`, `ENTERPRISE` with pricing defined according to Section 72.
  - Server-side entitlement authority in `@platform/contracts/src/billing.ts` and `@platform/domain/src/billing-service.ts`. Never hard-coded in frontend components.
  - Limits matrix (orders, channels, warehouses, users, rate limits, automations, storage) and feature toggles (`auditExport`, `advancedReconciliation`, `webhooks`, `aiInsights`, `prioritySupport`).
- Architectural Pipeline:
  `Stripe API / Webhook → HMAC-SHA256 signature verification → Verified billing event → Billing domain state machine → Internal subscription & entitlement store → Authorization / quota enforcement`.
- Cryptographic Webhook Security:
  - Stripe webhook signature verification (`verifyStripeWebhookSignature` in `@platform/integrations/src/stripe.ts`) using `crypto.timingSafeEqual` and 300s timestamp tolerance against replay attacks.
  - Rejects tampered payloads, forged signatures, expired timestamps, or missing headers with `400 Bad Request` (`INVALID_WEBHOOK_SIGNATURE`).
- The 8 Canonical Billing Scenarios Fully Verified (Section 116 & Prompt 22):
  - 1. New subscription creation (`checkout.session.completed`, `customer.subscription.created`)
  - 2. Payment success (`invoice.paid`)
  - 3. Payment failure & past-due handling (`invoice.payment_failed`)
  - 4. Plan upgrade (`customer.subscription.updated` Starter → Growth unlocks higher quotas and audit export immediately)
  - 5. Plan downgrade (`customer.subscription.updated` Scale → Growth adjusts quotas downward safely)
  - 6. Cancellation (`cancel_at_period_end` preserved until period end; `customer.subscription.deleted` marks `CANCELED`)
  - 7. Reactivation (`customer.subscription.created` transitions from `CANCELED` back to `ACTIVE`)
  - 8. Usage threshold enforcement across all 7 metrics (`NORMAL`, `INFO`, `WARNING`, `HARD_LIMIT`)
- CRITICAL INVARIANT GATE (Section 75 & Prompt 22):
  - Whitelisted critical inventory operations (`INVENTORY_SYNC`, `SYNC_OPERATION`, `READ_BACK_VERIFICATION`, `INVENTORY_MUTATION`, `RECONCILIATION_CORRECTION`, `ORDER_RESERVATION`) are NEVER blocked by soft or order quotas.
  - Discretionary resource additions (`CHANNELS`, `WAREHOUSES`, `USERS`) are strictly capped at plan limits with `PlanLimitExceededError`.
- Multi-Tenant Isolation & Audit Trail:
  - Organization A and Organization B subscriptions and metering are completely isolated.
  - Material billing events emit immutable audit records with `actorType: "WEBHOOK"`.
- Section 56 Billing REST API:
  - `GET /billing/subscription` (requires `billing:read`)
  - `POST /billing/checkout` (requires `billing:manage`)
  - `POST /billing/portal` (requires `billing:manage`)
  - `POST /webhooks/stripe` (validates HMAC signature, processes events idempotently)
- Architectural docs: [`docs/architecture/BILLING_SYSTEM.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/architecture/BILLING_SYSTEM.md).
- Automated verification suite: [`tests/phase21-billing.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase21-billing.test.ts) (29 tests passed).

### Phase 22: Notifications (Prompt 23) — `VERIFIED`
- V1 Delivery Channels:
  - In-App Notification Inbox (`IN_APP`): Read/unread badges, status management, deep links, dismissal.
  - Email Dispatch Provider (`EMAIL`): Managed through `EmailDispatchProvider` interface and verified via `MockEmailDispatchProvider` with delivery logging.
- The 7 Canonical Notification Categories (Section 76 & Prompt 23):
  - 1. `CRITICAL_INVENTORY_CONFLICT`
  - 2. `INTEGRATION_AUTHENTICATION`
  - 3. `REPEATED_SYNC_FAILURE`
  - 4. `LOW_STOCK`
  - 5. `NEGATIVE_INVENTORY`
  - 6. `RECONCILIATION_REQUIRED`
  - 7. `BILLING`
- Intelligent Deduplication & Sliding Window (Prompt 23 Canonical Gate):
  - Collapses repeated failures (e.g. 14 SKU sync failures against Shopify in 20 minutes) into 1 incident summary notification (`occurrenceCount: 14`, aggregated entity list in metadata).
  - Eliminates email notification spam; escalates severity to `CRITICAL` on high failure frequency.
  - Failures occurring after the 20-minute window cleanly initialize new incidents.
- Routine Operation Noise Reduction Mandate:
  - Routine background successes (`SYNC_JOB_COMPLETED`, `INVENTORY_SYNC_SUCCESS`, `ORDER_IMPORT_SUCCESS`, `READ_BACK_VERIFIED`, `HEARTBEAT_SUCCESS`) are strictly suppressed from generating notifications.
- Notification Preferences Engine:
  - Per-tenant and per-user configuration: `inAppEnabled`, `emailEnabled`, `categoryPreferences` toggles, `minEmailSeverity` threshold filter (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
- Delivery Failure & Retry Handling:
  - Tracks delivery status (`PENDING`, `DELIVERED`, `FAILED`), handles transport timeouts gracefully.
- Section 10 Notifications REST API:
  - `GET /notifications`: List notifications with status/category/severity filters and pagination.
  - `GET /notifications/unread-count`: Returns fast badge count `{ unreadCount: N }`.
  - `PATCH /notifications/:id/read`: Marks a single notification as read.
  - `POST /notifications/mark-all-read`: Marks all notifications for user/org as read.
  - `DELETE /notifications/:id`: Dismisses a notification.
  - `GET /notifications/preferences`: Retrieves user/org notification preferences.
  - `PUT /notifications/preferences`: Updates user/org notification preferences.
- Architectural docs: [`docs/architecture/NOTIFICATION_- Automated verification suite: [`tests/phase22-notifications.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase22-notifications.test.ts) (26 tests passed).
 
### Phase 23: Application API Conformance (Prompt 24) — `VERIFIED`
- Base Path `/api/v1` and Unversioned Route Aliases across all 11 core functional API families:
  - `/auth`: Session and identity inspection.
  - `/organizations`: Tenant isolation and RBAC.
  - `/products`: Multi-tenant product catalog, variants, and dimensions.
  - `/inventory`: Balances, ledger audit timelines, adjustments, recount reconcile, conflicts.
  - `/orders`: External order intake, automatic reservations, and cancellation lifecycle.
  - `/integrations`: Connect, health checks, manual sync, and reconnect/disconnect.
  - `/sync` & `/sync-jobs`: Asynchronous synchronization dispatch and BullMQ tracking.
  - `/reconciliation`: Discrepancy audits and correction approval/rejection.
  - `/exceptions`: Exception resolution, ignore, and diagnostic explanations.
  - `/audit`: Tamper-evident immutable compliance trail; HTTP 405 on mutations.
  - `/billing` & `/notifications`: Subscription tiers, stripe portal, notification inbox, and preferences.
- Uniform Envelope Architecture:
  - Success Envelope: `{ data: T, meta: { timestamp, correlationId?, requestId?, pagination? } }`.
  - Error Envelope: `{ error: { code, message, correlationId?, requestId?, details? } }`.
  - Masked generic 500 error responses preventing internal stack traces or raw database leakage.
- Input & Output Discipline:
  - Pagination limits: Default 50 items, max 250 items; rejects `limit > 250` with HTTP 400.
  - Payload protection: Bodies > 1MB rejected with HTTP 413 `PAYLOAD_TOO_LARGE`.
  - Malformed JSON handling: HTTP 400 `INVALID_JSON`.
  - Sliding-window rate limiter: HTTP 429 `RATE_LIMITED` with `Retry-After` header.
  - Security headers present on every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, HSTS, and CSP.
  - Idempotency key deduplication on mutations (`/orders`, `/inventory/adjustments`, `/sync-jobs`).
- Architectural docs: [`docs/architecture/API_CONFORMANCE.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/architecture/API_CONFORMANCE.md).
- Automated verification suite: [`tests/phase23-api-conformance.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase23-api-conformance.test.ts) (26 tests passed).

### Phase 24: Application UI Foundation (Prompt 25) — `VERIFIED`
- MVP Production Navigation:
  - 8 core production routes: `Overview`, `Inventory`, `Orders`, `Products`, `Exceptions`, `Integrations`, `Settings`, `Billing`.
  - Grouped structure: Core, Operations, Platform & Channels, Organization & Billing.
  - Strict RBAC visibility filtering based on active user permissions.
- Feature-Flagged Future Surfaces Gating:
  - `Warehouses`, `Purchasing`, `Reports`, and `AI Assistant` feature flags default to `false`.
  - Hidden from operational navigation by default; rendered with `disabled: true` and `Preview` badge when preview mode is requested.
  - Server routes return HTTP 404 with `FEATURE_FLAG_DISABLED` semantic explanation card if accessed while flag is disabled.
- Universal 6-State UI Handling on Every Component & View:
  - `loading`: Animated skeleton pulse shimmer, spinner, accessible `aria-busy="true"`.
  - `empty`: SVG illustration, descriptive explanation, primary CTA.
  - `success`: Confirmed green status check, feedback message, forward action.
  - `error`: Error code badge, correlation ID tag, human-readable diagnostic message, retry button.
  - `partial_failure`: Identifies which channels succeeded and failed, expandable diagnostic payload, targeted retry.
  - `permission_denied`: Missing permission code, admin elevation notice, return navigation.
- Reusable UI Component Suite (All 13 Components in `@platform/ui`):
  - `DataTable`: Server-side pagination (default 50, max 250), column sorting, selection, actions, multi-state embedding.
  - `StatusBadge`: Maps domain status to tokens (Trust states: `LIVE`, `VERIFIED`, `STALE`, `CONFLICT`, `UNKNOWN`; sync states; order states; severity).
  - `MetricCard`: KPI values, trend delta badges, trust badge, loading skeleton.
  - `ExceptionCard`: Border severity styling, SKU, channel, correlation ID, suggested action, resolution options.
  - `Timeline`: Chronological audit sequence, inventory delta pills (`+10 units`, `-2 units`), actor attribution, payload inspection.
  - `Drawer`: Slide-out panel for SKU details and filters (`role="dialog"`, `aria-modal="true"`).
  - `Modal`: Accessible dialog container with backdrop blur, keyboard escape dismissal.
  - `ConfirmDialog`: Destructive operation guardrail with typed confirmation check (Section 47).
  - `EmptyState`: Actionable empty state with illustration and CTA.
  - `ErrorState`: Diagnostic error card with correlation ID and retry action.
  - `LoadingState`: Animated skeleton pulse with accessible attributes.
  - `IntegrationCard`: Channel cards (Shopify, Amazon, Walmart, Custom), sync status badge, health telemetry.
  - `InventoryCell`: Mathematical breakdown of available inventory invariant:
    `available = on_hand - reserved - safety_stock - allocated`, trust badge, freshness timestamp.
- Application Shell (`apps/web`):
  - Topbar: Org switcher, search command palette trigger (`⌘K`), system status pulse, theme toggle (dark/light), notifications counter with badge, user menu.
  - Sidebar: Branded logo, grouped navigation, active route highlight, immutable ledger indicator.
  - Breadcrumbs: Hierarchical pathing (`Overview / Inventory`).
- Architectural docs: [`docs/architecture/UI_FOUNDATION.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/architecture/UI_FOUNDATION.md).
- Automated verification suite: [`tests/phase24-ui-foundation.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase24-ui-foundation.test.ts) (38 tests passed).

---

## 2. Current Health & Verification Status

- **Build:** `npm run build` exits with code 0 across all 9 shared packages and 4 applications.
- **Typecheck:** `npm run typecheck` exits with code 0 across all 13 workspaces.
- **Test Suite:** `npm test` executes **547 tests across 194 suites with 0 failures**:
  - Phase 1 tests: 16 passed
  - Phase 2 tests: 13 passed
  - Phase 3 tests: 12 passed
  - Phase 4 tests: 22 passed
  - Phase 5 tests: 21 passed
  - Phase 6 tests: 31 passed
  - Phase 7 tests: 17 passed
  - Phase 8 tests: 13 passed
  - Phase 9 tests: 18 passed
  - Phase 10 tests: 12 passed
  - Phase 11 tests: 18 passed
  - Phase 12 tests: 30 passed
  - Phase 13 tests: 24 passed
  - Phase 14 tests: 13 passed
  - Phase 15 tests: 27 passed
  - Phase 16 tests: 17 passed
  - Phase 17 tests: 23 passed
  - Phase 18 tests: 33 pas  - Phase 23 tests: 26 passed
  - Phase 24 tests: 38 passed
  - Phase 25 tests: 21 passed

### Phase 25: Onboarding (Prompt 26) — `VERIFIED`
- The 9-Step Progressive Merchant Onboarding Flow:
  - Canonical progression: `CREATE_ACCOUNT → CREATE_ORGANIZATION → CHOOSE_PRIMARY_CHANNEL → CONNECT_CHANNEL → IMPORT_CATALOG → MAP_SKUS → VALIDATE_INVENTORY → ENABLE_SYNCHRONIZATION → COMPLETED`.
  - Implemented via `OnboardingService` in [`packages/domain/src/onboarding-service.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/domain/src/onboarding-service.ts) and contracts in [`packages/contracts/src/onboarding.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/contracts/src/onboarding.ts).
  - Explicit step progress tracking: `COMPLETED`, `CURRENT`, `BLOCKED`, `NEEDS_ATTENTION`.
  - Rejection of illegal transitions and skipped prerequisites with `InvalidOnboardingStepError`.
- CRITICAL INITIAL SYNC SAFETY GATE (Prompt 26 Mandatory Invariant):
  - **Never enable destructive outbound synchronization immediately after connecting a channel.**
  - Enforced the non-bypassable sequence: `IMPORT → COMPARE → SHOW DIFFERENCES → USER CONFIRMS SOURCE OF TRUTH → ENABLE OUTBOUND SYNC`.
  - Canonical Prompt 26 Discrepancy Scenario Automated:
    - Internal Ledger = 20, Shopify = 20, Amazon SP-API = 18.
    - System detects difference, flags `status: "DIFFERENCES_FOUND"`, marks `discrepancy: true`, sets step status `NEEDS_ATTENTION`, and sets `allConfirmed: false`.
    - **Non-Silent Overwrite Guarantee:** Amazon is NEVER silently overwritten.
    - Strictly blocks enabling outbound sync or confirming baseline while discrepancies remain unconfirmed (`InitialSyncSafetyViolationError` / HTTP 400).
  - Explicit Source-of-Truth Selection:
    - Support for `INTERNAL_LEDGER` (20 units), `CHANNEL` (Amazon 18 units), and `CUSTOM` (e.g. physical count 22 units).
    - Batch resolution and single SKU resolution with audit notes.
  - Explicit Confirmation Guardrail:
    - Outbound synchronization strictly requires user confirmation checkbox (`confirmed: true`); throws `InitialSyncSafetyViolationError` if attempted without it.
    - Emits immutable audit log record (`INTEGRATION_CONNECTED` / `ONBOARDING`) upon successful sync activation.
- Multi-Tenant Isolation & RBAC:
  - Complete isolation between Org A and Org B onboarding sessions.
  - `VIEWER` role forbidden from mutating onboarding steps (HTTP 403 `FORBIDDEN` / `PermissionDeniedError`).
  - `OWNER`/`ADMIN` authorized.
- Section 62, 63, 64 REST API Endpoints (`apps/api`):
  - `GET /onboarding/state`: Auto-initializes and returns active session with envelope.
  - `POST /onboarding/choose-channel`: Selects primary sales channel.
  - `POST /onboarding/connect-channel`: Connects channel account.
  - `POST /onboarding/import-catalog`: Ingests catalog; preserves unmapped SKUs.
  - `POST /onboarding/map-skus`: Maps SKUs to internal catalog.
  - `POST /onboarding/validate-inventory`: Executes baseline inventory comparison.
  - `POST /onboarding/resolve-discrepancy`: Explicitly resolves individual SKU source of truth.
  - `POST /onboarding/batch-resolve-discrepancies`: Resolves discrepancies in bulk.
  - `POST /onboarding/confirm-inventory`: Confirms all difference resolutions.
  - `POST /onboarding/enable-sync`: Initial sync safety gate for outbound synchronization.
  - `POST /onboarding/complete`: Finalizes onboarding and unlocks platform dashboard.
  - `POST /onboarding/reset`: Admin/test reset endpoint.
- Accessible UI Stepper & Discrepancy Components (`@platform/ui` & `apps/web`):
  - `renderOnboardingStepper`: Progressive stepper with `<nav aria-label="Progressive Onboarding Steps">`, `<ol>`, `aria-current="step"`, and state badges.
  - `renderDiscrepancyTable`: Discrepancy comparison table rendering Internal = 20, Shopify = 20, Amazon = 18, `CONFLICT` badge, Source-of-Truth select dropdown, and Initial Sync Safety Guarantee banner.
  - `renderSyncConfirmationCard`: Outbound sync guardrail card with confirmation checkbox and blocked/enabled states.
  - Web portal route `/app/onboarding`: Interactive 9-step onboarding wizard.
- Architectural docs: [`docs/architecture/ONBOARDING.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/architecture/ONBOARDING.md).
- Automated verification suite: [`tests/phase25-onboarding.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase25-onboarding.test.ts) (21 tests passed).

### Phase 26: Inventory UI & Dynamic Multichannel Controls (Prompt 27) — `VERIFIED`
- Contracts & Query Schemas (`@platform/contracts`):
  - `ConnectedChannelColumnDtoSchema`, `InventoryChannelQuantityDtoSchema`, `InventoryTableRowDtoSchema`, `InventoryTableQuerySchema`, `InventoryTableResponseDtoSchema`.
  - All 8 canonical SKU Detail DTO schemas: `SkuSummarySectionDtoSchema`, `SkuWarehouseBalanceDtoSchema`, `SkuChannelBalanceDtoSchema`, `SkuSyncHistoryDtoSchema`, `SkuExceptionDtoSchema`, `SkuExplainableTimelineEventDtoSchema`, `SkuOrderReservationDtoSchema`, `SkuAuditEntryDtoSchema`, `SkuDetailDtoSchema`.
- UI Components (`@platform/ui`):
  - `renderInventoryTable`: Complete multichannel inventory data table with dynamic connected channel columns, low stock/mismatch filter chips, search fields, warehouse dropdown, and pagination.
  - `renderSkuDetailDrawer`: 8-section slide-over inspection drawer with mathematical formula callout ($Available = OnHand - Reserved - Safety - Allocated$), causal timeline traversal, warehouse balances, channel comparisons, and audit records.
  - WCAG 2.1 AA accessibility: Explicit table headers (`th scope="col"`), landmark roles (`role="search"`, `role="region"`, `role="navigation"`), high-contrast tokens, keyboard traversal.
- Backend API Endpoints (`apps/api`):
  - `GET /inventory/table`: Server-side filtering (`sku`, `product`, `warehouse`, `channel`, `lowStock`, `mismatch`, `syncState`), dynamic connected channel column projection (filtering only `ACTIVE` integrations), and pagination envelope.
  - `GET /inventory/:skuId/detail` & `GET /inventory/sku-detail/:sku`: Returns all 8 canonical sections for detailed SKU inspection.
- Web Application Route (`apps/web`):
  - Updated `/app/inventory` route integrating `renderInventoryView` with table, interactive search/filter controls, and drawer trigger on `?skuDetail=<SKU>`.
- Invariant & Safety Guarantees:
  - Dynamic Channel Honesty: Strictly does NOT present eBay or Walmart as operational channels when those integrations are not enabled.
  - Formula Invariant: $available = on\_hand - reserved - safety\_stock - allocated - damaged - quarantined$.
  - Trust State Safety: Explicit trust states (`LIVE`, `VERIFIED`, `STALE`, `CONFLICT`, `UNKNOWN`); never uses green verified badge for unverified pending submissions.
- Architectural docs: [`docs/architecture/INVENTORY_UI.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/architecture/INVENTORY_UI.md).
- Automated verification suite: [`tests/phase26-inventory-ui.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase26-inventory-ui.test.ts) (16 tests passed).

---

## 2. Current Health & Verification Status

- **Build:** `npm run build` exits with code 0 across all 9 shared packages and 4 applications.
- **Typecheck:** `npm run typecheck` exits with code 0 across all 13 workspaces.
- **Test Suite:** `npm test` executes **584 tests across 209 suites with 0 failures**:
  - Phase 1 tests: 16 passed
  - Phase 2 tests: 13 passed
  - Phase 3 tests: 12 passed
  - Phase 4 tests: 22 passed
  - Phase 5 tests: 21 passed
  - Phase 6 tests: 31 passed
  - Phase 7 tests: 17 passed
  - Phase 8 tests: 13 passed
  - Phase 9 tests: 18 passed
  - Phase 10 tests: 12 passed
  - Phase 11 tests: 18 passed
  - Phase 12 tests: 30 passed
  - Phase 13 tests: 24 passed
  - Phase 14 tests: 13 passed
  - Phase 15 tests: 27 passed
  - Phase 16 tests: 17 passed
  - Phase 17 tests: 23 passed
  - Phase 18 tests: 33 passed
  - Phase 19 tests: 33 passed
  - Phase 20 tests: 35 passed
  - Phase 21 tests: 29 passed
  - Phase 22 tests: 26 passed
  - Phase 23 tests: 26 passed
  - Phase 24 tests: 38 passed
  - Phase 25 tests: 21 passed
  - Phase 26 tests: 16 passed

---

## 3. Next Step to Execute

**Next Phase: Phase 27: Exception UI (Prompt 28)**  
From [`specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md) (Prompt 28):

### Canonical Requirements for Phase 27 (Prompt 28):
1. **The Exception Inbox:**
   - Filters: `Critical`, `High`, `Medium`, `Low`, `Resolved`, `Open`, `Inventory`, `Orders`, `Integrations`.
   - Sort by: `severity`, `age`, `impact`.
2. **Exception Detail Core Questions:**
   - What happened?
   - Why?
   - What is affected?
   - What did the system try?
   - What happens next?
   - What can I do?
3. **Display Attributes:**
   - `SKU`, `Internal quantity`, `External quantity`, `Difference`, `Last verified update`, `Likely cause`, `Retry state`, `Affected channel`, `Recommended action`.
   - Inferred cause labeling: If cause is inferred rather than proven, explicitly label as an inference.
4. **Action Handlers:**
   - `Retry`, `Investigate`, `Reconcile`, `Resolve`, `Ignore`.
   - Confirmation required for dangerous operations.
   - Do not represent an exception as resolved until the underlying state is actually resolved.


