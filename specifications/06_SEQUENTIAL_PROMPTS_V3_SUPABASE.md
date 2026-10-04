# Google Antigravity — Multichannel Inventory Control Platform
## Sequential Engineering Implementation Prompt Pack — VERIFIED SUPABASE-ALIGNED REVISION

**Source:** FINAL ENGINEERING SPECIFICATION V2  
**Purpose:** Sequential prompts for Google Antigravity implementation  
**Prompt count:** 63  
**Execution model:** Run one prompt at a time, in order.  
**Revision:** Verified Revision 2 — Supabase-aligned  
**Status:** Execution-grade prompt pack

---

## HOW TO USE THIS FILE

Each numbered section contains one independent prompt.

Copy only the contents inside the corresponding prompt section and paste it into Google Antigravity.

Do not send all prompts simultaneously.

Antigravity must complete and validate each phase before proceeding to the next.

The prompts intentionally enforce:

- canonical specification fidelity
- architecture before UI
- domain integrity before integrations
- transactional inventory control
- tenant isolation
- idempotency
- synchronization verification
- reconciliation
- exception management
- auditability
- security
- observability
- automated testing
- production-readiness verification
- explicit separation of implementation, verification, and production readiness

### STATUS MODEL

Every subsystem uses these distinct states:

**IMPLEMENTED** — required code and behavior exist.

**VERIFIED** — implementation has passed the applicable automated/integration/provider tests and evidence has been captured.

**PRODUCTION READY** — implementation is verified and all applicable security, observability, operational, failure-handling, documentation, rollback, and release requirements have passed.

Do not use "complete" ambiguously.

### TEST EVIDENCE MODEL

Where applicable, classify evidence as:

- UNIT
- INTEGRATION-MOCK
- PROVIDER-SANDBOX
- PROVIDER-LIVE-TEST
- E2E
- SECURITY
- PERFORMANCE
- DR

Mock-provider tests do not establish that a real marketplace integration is operational.

Provider production-readiness evidence must identify the strongest applicable real-provider evidence available: PROVIDER-SANDBOX, PROVIDER-LIVE-TEST, or another explicitly documented provider verification method. If only mock evidence exists, the capability cannot be reported as production-ready.

### CANONICAL IMPLEMENTATION ORDER

The source specification's Section 151 remains authoritative.

This 63-prompt pack expands that 30-step implementation order into smaller executable gates. The expansion adds cross-cutting API conformance, UI, acceptance testing, security, observability, operations, and final audit phases without weakening the canonical dependency chain.

The critical architectural path remains:

Repository
↓
Infrastructure
↓
Database
↓
Authentication
↓
Organizations / RBAC
↓
Domain
↓
Inventory Ledger
↓
Reservations
↓
Orders
↓
Jobs
↓
Synchronization
↓
Providers
↓
Verification
↓
Reconciliation
↓
Exceptions
↓
Audit
↓
Billing
↓
Notifications
↓
Application/API conformance
↓
UI
↓
Testing
↓
Observability
↓
Security
↓
Public Product
↓
Operations
↓
Final Audits
↓
Production Gate

The source specification remains authoritative if any wording conflict is discovered.

---

---

## 01. PROMPT 01 — MASTER OPERATING CONTRACT

```text
You are implementing the Multichannel Inventory Control Platform defined by the attached FINAL ENGINEERING SPECIFICATION V2.

Treat that document as the canonical engineering contract. This prompt pack is an execution layer over that specification, not a replacement for it.

SOURCE-OF-TRUTH RULE

1. The canonical engineering specification is authoritative.
2. This prompt pack may sequence and operationalize requirements, but must not weaken, contradict, or silently replace them.
3. If a prompt conflicts with the canonical specification, stop and report the conflict before implementing the conflicting behavior.
4. Requirements marked MUST are mandatory.
5. Requirements marked SHOULD should be implemented unless a documented technical reason prevents implementation.
6. Never silently remove, weaken, or reinterpret a requirement.
7. Never invent unsupported marketplace capabilities.
8. Never represent mocked functionality as production functionality.
9. Never mark external synchronization as VERIFIED merely because an API request succeeded.
10. Never make the frontend authoritative for security, permissions, tenancy, billing, or inventory.
11. Never directly mutate inventory outside the Inventory domain.
12. Never use cache as the authoritative inventory store.
13. Never silently overwrite marketplace inventory during initial connection.
14. Never hide discrepancies or negative inventory.
15. Never bypass audit logging for material mutations.
16. Never use fake success responses when a real provider operation has not occurred.
17. Never claim an integration is production-ready until the required implementation, verification, security, operational, and acceptance tests pass.
18. Do not jump ahead to later implementation phases merely because they are easier.
19. Preserve the architecture as a multi-tenant SaaS system.
20. Keep domain logic out of UI components.
21. Do not duplicate domain logic between API, worker, web, and integrations.
22. Every asynchronous operation must have explicit state and observability.
23. Every material inventory mutation must be explainable.

COMPLETION STATES

Every feature, subsystem, integration, and phase must distinguish:

IMPLEMENTED
Code and required behavior exist.

VERIFIED
Implementation has passed the relevant automated/integration/provider tests and evidence has been captured.

PRODUCTION READY
Implementation is verified and all applicable security, observability, failure-handling, operational, documentation, rollback, and release requirements have passed.

Do not use "complete" as an ambiguous substitute for these states.

REQUIRED WORKING METHOD

For every implementation phase:

1. Inspect the current repository.
2. Read the relevant sections of the canonical specification.
3. Identify dependencies and applicable prior phases.
4. Inspect existing implementation before creating anything.
5. Create or update the domain model.
6. Implement backend behavior.
7. Implement background processing where required.
8. Implement tests.
9. Implement UI only after underlying behavior exists, unless the phase is explicitly a UI-foundation phase.
10. Run type checking.
11. Run linting.
12. Run relevant unit tests.
13. Run relevant integration tests.
14. Run relevant provider tests where applicable.
15. Run relevant end-to-end tests where applicable.
16. Perform a security review of the phase.
17. Verify acceptance criteria.
18. Report implementation status honestly.

TEST EVIDENCE CLASSES

When relevant, classify tests as:

UNIT
INTEGRATION-MOCK
PROVIDER-SANDBOX
PROVIDER-LIVE-TEST
E2E
SECURITY
PERFORMANCE
DR

Never use mock-provider results as evidence that a real provider integration is operational.

COMPLETION REPORT

At the end of every phase report:

PHASE:
Status: IMPLEMENTED / VERIFIED / PRODUCTION READY / PARTIAL / BLOCKED
Implemented:
Files/modules changed:
Database changes:
API changes:
Worker/queue changes:
UI changes:
Tests added:
Tests executed:
Evidence class:
Validation results:
Security considerations:
Known limitations:
Unresolved blockers:
Specification requirements satisfied:
Specification requirements intentionally deferred:

Never report PRODUCTION READY if critical requirements remain unimplemented or unverified.
```


## SUPABASE PLATFORM BOUNDARY — APPLIES TO ALL 63 PROMPTS

The implementation MUST use Supabase for the managed backend capabilities below without changing the product domain model, business rules, synchronization semantics, reconciliation behavior, API architecture, queue architecture, or UX requirements.

### Supabase services in scope

- **Supabase Postgres** is the production/staging PostgreSQL database.
- **Supabase Auth** is the authentication/session provider.
- **Supabase Storage** is the managed object/file storage layer for imports, exports, reports, generated files, migration files, and other file artifacts where the engineering specification calls for object storage.

### Services that remain unchanged

- **Redis + BullMQ or equivalent durable queue** remains the asynchronous job/synchronization queue unless a later canonical specification explicitly changes it.
- The **Node.js/NestJS API** remains the application/domain API boundary.
- The **worker** remains responsible for long-running synchronization, provider operations, reconciliation, and other durable background work.
- PostgreSQL remains PostgreSQL; Supabase is the managed platform providing it.
- Stripe, transactional email, OpenTelemetry, Shopify, Amazon, and other provider integrations remain governed by their existing requirements.

### Supabase does not become the domain authority

Supabase is infrastructure/platform technology, not a replacement for the domain architecture.

Do not move inventory truth, reservation logic, reconciliation rules, provider orchestration, authorization policy, or business invariants into client-side Supabase calls. Core domain mutations MUST continue through the server-side domain/API layer and transactional database operations.

Use Supabase Data APIs selectively where appropriate. Do not replace the established NestJS/domain API with auto-generated CRUD endpoints merely because Supabase exposes them.

### Database and tenancy security

Enable PostgreSQL Row Level Security (RLS) for tenant-scoped tables exposed through Supabase. RLS is defense-in-depth. Server-side authorization and organization context remain mandatory.

Never expose Supabase secret/service-role (legacy) credentials to the browser. Treat privileged Supabase credentials exactly like any other server secret.

Use the Supabase publishable key only in contexts where RLS and grants make that access safe.

Background workers using privileged Supabase credentials MUST establish and validate explicit organization context before performing tenant-scoped work.

### Connection and transaction rules

Use an appropriate Supabase Postgres connection method/pooler for the runtime. Preserve real PostgreSQL transactions, row locks, optimistic concurrency, constraints, and atomic domain mutations.

Do not route high-integrity multi-step inventory mutations through a sequence of independent client-side REST calls.

### Authentication rules

Supabase Auth owns identity credentials, authentication sessions, JWT issuance, and supported credential/provider flows. The application owns organization membership, roles, permissions, business authorization, and audit semantics.

For Next.js SSR, use the current Supabase SSR/cookie-session approach. For API requests carrying bearer JWTs, validate Supabase-issued identity on the server and then apply application authorization.

### Storage rules

Use Supabase Storage buckets with explicit access policies for application file artifacts. File authorization must remain tenant-aware. Sensitive provider credentials must NOT be stored in public buckets.

Signed URLs/download authorization, retention, size limits, content validation, and malware/file-safety requirements remain mandatory.

### Optional Supabase capabilities

Supabase Realtime, Edge Functions, Cron, Queues, and other optional services may be used only where they provide a concrete implementation benefit and do not replace the canonical Node/NestJS API, worker/queue architecture, inventory domain, or source-of-truth rules. Do not introduce them merely because they are available.

If an optional Supabase capability would alter an existing dependency or behavior, STOP and report the proposed architectural change before implementing it.

---

## 02. PROMPT 02 — REPOSITORY AND ARCHITECTURE FOUNDATION

```text
Implement Phase 1: Repository.

Inspect the repository before changing anything.

Establish the monorepo architecture required by the canonical specification.

Target structure:

/apps
    /web
    /api
    /worker
    /admin

/packages
    /database
    /domain
    /contracts
    /integrations
    /ui
    /config
    /observability
    /security
    /testing

/infrastructure
    /database
    /redis
    /deployment
    /monitoring

/docs
    /architecture
    /api
    /integrations
    /runbooks

Use TypeScript throughout.

Establish:

- Next.js
- React
- TypeScript
- Tailwind CSS
- accessible UI primitives
- TanStack Query
- React Hook Form
- Zod
- Node.js backend
- Supabase Postgres (managed PostgreSQL)
- Supabase Auth
- Supabase Storage
- @supabase/supabase-js
- @supabase/ssr for Next.js SSR session handling
- @supabase/server for server-side bearer-JWT integration where applicable
- Supabase CLI for local development and database migrations
- Redis
- BullMQ or equivalent durable queue
- Stripe integration boundary
- OpenTelemetry-compatible observability foundation

Do not build product functionality yet.

Establish clear package boundaries and dependency direction.

Domain logic must live in shared server-side packages.

Prevent circular dependencies.

Create architecture documentation explaining dependency direction.

Create environment configuration with safe development defaults.

Document the environment contract for at least:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- server-only Supabase secret key for privileged operations
- pooled Supabase Postgres connection configuration for trusted API/worker workloads
- Redis/BullMQ configuration

Use the current Supabase key model supported by the selected project. Never expose a Supabase secret key in browser code.

Never commit secrets.

ACCEPTANCE CRITERIA

- Monorepo builds.
- TypeScript compilation works.
- Applications have explicit boundaries.
- Shared packages are usable.
- API, web, worker, and admin can start independently.
- Supabase configuration for database, Auth, and Storage is represented correctly.
- Redis/BullMQ configuration is represented correctly.
- Environment configuration is validated.
- No credentials are committed.
- CI can execute typecheck/lint/build/test commands.

Status may be IMPLEMENTED or VERIFIED at this phase. Do not claim PRODUCTION READY merely because the repository foundation builds.

Do not proceed to database implementation until the phase is at least VERIFIED.
```

---

## 03. PROMPT 03 — INFRASTRUCTURE

```text
Implement Phase 2: Infrastructure from the canonical engineering specification.

Create reproducible development infrastructure for:

- Supabase local development stack (Postgres, Auth, Storage and related local Supabase services)
- Redis
- API
- worker
- web
- admin

Use containers where appropriate. For local Supabase development, prefer the Supabase CLI/local stack rather than maintaining a separate hand-built PostgreSQL/Auth/Storage replacement.

Establish development, staging, and production configuration boundaries.

Implement:

- health endpoints
- readiness checks
- liveness checks
- environment validation
- Supabase Postgres connectivity checks
- Supabase Auth configuration/health checks
- Supabase Storage configuration/health checks
- Redis connectivity checks

Health checks must verify actual dependencies where dependency health is claimed.

For Supabase, verify the configured project URL, database connectivity, Auth configuration, and Storage configuration without exposing secrets. Do not treat a reachable Supabase URL alone as proof that database/Auth/Storage functionality is healthy.

Create infrastructure documentation.

Do not claim production deployment readiness unless deployment is actually configured and tested.

ACCEPTANCE CRITERIA

The development stack can be started reproducibly.

A developer can verify:

Supabase Postgres healthy
Supabase Auth healthy/configured
Supabase Storage healthy/configured
redis healthy
api healthy
worker healthy
web healthy

Run validation before marking the phase VERIFIED.
```

---

## 04. PROMPT 04 — DATABASE FOUNDATION

```text
Implement Phase 3: Database from the canonical specification.

Create the database schema in Supabase Postgres using:

- UUID identifiers
- foreign keys
- constraints
- indexes
- timestamps
- tenant boundaries

Implement the core entities specified by the engineering document in Supabase Postgres:

Do not duplicate Supabase-managed auth.users as an independent identity source. If the application requires a domain users/profile record, link it to auth.users(id) while keeping domain-specific user data in application-owned tables.

Enable and test RLS on tenant-scoped tables. Create explicit organization-aware policies where tables are exposed to authenticated clients. Server-side domain authorization remains mandatory even when RLS exists.

Use database constraints, transactions, indexes, and concurrency controls exactly as required by the canonical engineering specification.

Core inventory mutations must not depend on the auto-generated Supabase REST API; use the established server/domain transaction boundary.

The core entities specified by the engineering document:

- organizations
- users
- memberships
- roles
- products
- product_variants
- SKUs
- channels
- channel_accounts
- channel_product_mappings
- warehouses
- inventory_balances
- inventory_events
- inventory_reservations
- orders
- order_items
- returns
- suppliers
- purchase_orders
- purchase_order_items
- sync_jobs
- reconciliation_runs
- reconciliation_results
- exceptions
- audit_logs

Do not simplify away fields specified by the canonical document.

Implement required enums or equivalent constrained types.

Implement required unique constraints.

Pay particular attention to:

organization_id + sku_id + warehouse_id

organization_id + SKU code

organization_id + channel account + external object ID

idempotency keys

correlation IDs

Create Supabase/Postgres migrations managed through the Supabase CLI and version control.

Do not make production schema changes manually through the Supabase dashboard as the normal deployment mechanism.

Create development/test seed data only where necessary.

Never create fake production data.

ACCEPTANCE CRITERIA

- Supabase migrations execute from an empty local/test project.
- Production/staging migrations can be applied reproducibly through the migration pipeline.
- Migrations are reproducible.
- Foreign keys work.
- Tenant relationships are explicit.
- Required unique constraints exist.
- Required indexes exist.
- Schema matches the canonical specification.
- Database tests pass.

Do not mark schema VERIFIED until migration, RLS-policy, constraint, transaction, and schema tests actually pass.
```

---

## 05. PROMPT 05 — AUTHENTICATION

```text
Implement Phase 4: Authentication using Supabase Auth.

Implement the application authentication contract:

POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/refresh
POST /auth/forgot-password
POST /auth/reset-password
GET /auth/me

Use Supabase Auth as the authentication provider and session authority.

Preserve the application-facing /auth API contract below, but implement it as a thin application adapter over Supabase Auth rather than building a second custom identity system.

Use Supabase Auth for registration, login, logout, refresh, password recovery/reset, session lifecycle, JWT issuance/verification, and supported authentication providers.

For the Next.js application use the current Supabase SSR approach with cookie-based sessions and PKCE where applicable. Use @supabase/ssr for the web SSR/session boundary. For the NestJS/API boundary, use the appropriate Supabase server-side package for bearer-JWT requests or an equivalent verified Supabase JWT validation path.

Do not store sensitive authentication material insecurely in browser storage. Do not create a parallel password-hash or refresh-token implementation unless the canonical specification explicitly requires application-specific credentials outside Supabase Auth. Supabase Auth owns credential storage and token issuance.

Application authorization, organization membership, roles, permissions, and business access control remain application/domain responsibilities and MUST NOT be delegated solely to authentication.

Use Supabase Postgres Row Level Security as defense-in-depth for tenant-scoped database access. RLS must not be treated as a substitute for server-side authorization.

Never expose a Supabase secret/service-role (legacy) key to browser code, public bundles, or user-controlled clients. Privileged keys may be used only in trusted server/worker/admin contexts with explicit authorization checks.

The Supabase publishable key may be used in the browser only with appropriate RLS policies and least-privilege grants.

Implement:

- Supabase Auth password/credential handling
- Supabase Auth session expiration configuration
- Supabase Auth refresh-token/session rotation behavior
- application/API authentication middleware that verifies Supabase-issued identity
- brute-force protection and rate limiting at the application/Supabase Auth boundary as applicable
- secure cookies for SSR sessions where applicable
- explicit separation between authentication and application authorization

Create authentication audit events where required.

Map the application /auth endpoints to Supabase Auth operations without creating a second credential store. Preserve the existing API contract and response semantics where required by the frontend/API specifications.

Configure redirect URLs, email/password recovery, session settings, and required authentication providers per environment.

For Next.js, use cookie-based SSR sessions through the Supabase SSR integration. For the API, verify Supabase-issued JWT identity and derive the application user/organization context before authorization.

Keep Supabase Auth system tables under Supabase ownership; do not directly mutate auth.users from ordinary application code except through documented supported mechanisms.

TEST:

- registration
- duplicate account
- successful login
- invalid credentials
- logout
- expired session
- token/session refresh
- password reset
- brute-force protection

No authentication test may depend on fake authentication. Test against Supabase Auth locally/test-project infrastructure or another real Supabase Auth environment as appropriate; mocks may only isolate non-authenticated external dependencies.

Do not create a custom JWT issuer merely to make tests pass.

Run all relevant tests and report exact results.
```

---

## 06. PROMPT 06 — ORGANIZATIONS AND RBAC

```text
Implement Phase 5: Organizations and RBAC.

Implement:

Organization
User
Membership
Role
Permission

System roles:

OWNER
ADMIN
MANAGER
OPERATOR
VIEWER

Enforce organization context server-side.

Never trust a frontend organization ID.

Every tenant-scoped operation must derive and validate organization context from authenticated authorization state.

Implement permission checks for:

- inventory adjustments
- reconciliation
- integrations
- member management
- billing
- administrative actions
- dangerous bulk operations

TENANT ISOLATION TEST

Create:

Organization A
Organization B

Attempt access from A to:

- B products
- B inventory
- B orders
- B exceptions
- B integrations
- B audit records

Every unauthorized access must fail.

Also test privilege escalation attempts.

Do not mark VERIFIED until these tests pass.
```

---

## 07. PROMPT 07 — DOMAIN MODELS

```text
Implement Phase 6: Domain Models.

Establish explicit domain boundaries:

Identity
Organizations
Users
Roles
Billing
Products
Variants
SKUs
Catalog
Channels
Channel Accounts
Mappings
Warehouses
Inventory
Reservations
Allocations
Orders
Returns
Purchasing
Suppliers
Synchronization
Reconciliation
Exceptions
Notifications
Audit
Analytics
AI

Do not implement every future feature yet.

Establish clean domain interfaces and dependency boundaries.

Inventory mutation must only occur through the Inventory domain.

Create domain services for:

- inventory calculations
- reservation
- release
- adjustment
- allocation
- reconciliation
- synchronization state transitions
- exception creation

Prevent arbitrary modules from directly mutating inventory.

Add domain tests covering core invariants.

Provide architecture evidence showing dependency direction.
```

---

## 08. PROMPT 08 — INVENTORY LEDGER

```text
Implement Phase 7: Inventory Ledger.

This is the core integrity subsystem.

Implement:

inventory_balances
inventory_events

Available quantity must be derived according to the canonical formula:

available =
on_hand
- reserved
- safety_stock
- damaged
- quarantined
- allocated

Do not store available as an independently mutable value.

Every inventory mutation must create an inventory event containing:

- before state
- after state
- event type
- quantity delta
- source
- actor
- correlation ID
- idempotency key
- timestamp

Implement:

- initial import
- purchase receipt
- manual adjustment
- recount
- damage
- warehouse transfer
- reconciliation correction

Use transactions and concurrency control.

CRITICAL CONCURRENCY TEST

Two simultaneous transactions attempt to consume the final available unit.

Expected:

One succeeds.

One fails or resolves according to configured behavior.

Inventory never becomes incorrectly oversold because of a race.

Also test duplicate mutation requests and idempotency.

Do not mark VERIFIED until inventory integrity tests pass.
```

---

## 09. PROMPT 09 — RESERVATIONS

```text
Implement Phase 8: Reservations.

Implement transactional reservations with statuses:

ACTIVE
RELEASED
FULFILLED
EXPIRED

Each reservation must contain:

- organization
- SKU
- warehouse
- order
- quantity

Implement:

- reserve
- release
- fulfill
- expire

Protect against concurrent reservations.

TEST:

- one-unit reservation race
- duplicate reservation request
- reservation release
- reservation fulfillment
- insufficient inventory
- retry/idempotency
- tenant isolation

Reservations must be integrated with the inventory ledger through the correct domain transaction.

Do not perform non-transactional read-then-write reservation logic.

Do not mark VERIFIED until reservation concurrency and idempotency tests pass.
```

---

## 10. PROMPT 10 — ORDERS

```text
Implement Phase 9: Orders.

Implement order and order-item domain models and APIs.

Support:

- order creation/import
- order retrieval
- order events
- cancellation
- reservation association

External order identity must use:

organization
channel account
external order ID

If an order item cannot be mapped to a SKU:

DO NOT silently reduce inventory.

Instead create an ORDER_UNMAPPED_SKU exception.

TEST:

- duplicate external order
- unmapped SKU
- order import
- cancellation
- reservation association
- tenant isolation

Implement predictable REST responses and proper authorization.
```

---

## 11. PROMPT 11 — JOB SYSTEM

```text
Implement Phase 10: Job System.

Use Redis + BullMQ or an equivalent durable queue.

All long-running and external synchronization operations must execute asynchronously.

Implement job states:

QUEUED
RUNNING
SUCCEEDED
PARTIAL
RETRYING
FAILED
CANCELLED

Every job must expose:

- job ID
- type
- started
- duration
- progress
- attempts
- current state
- errors

Implement:

- exponential backoff
- jitter
- retry limits
- cancellation where feasible
- dead-letter/error handling
- structured job logging

Create tenant-aware/fair scheduling architecture.

One merchant must not monopolize workers.

Test worker restart/recovery behavior.
```

---

## 12. PROMPT 12 — SYNCHRONIZATION FRAMEWORK

```text
Implement Phase 11: Synchronization Framework.

Create the provider-independent synchronization engine.

Implement sync_jobs.

State machine:

QUEUED
→ PROCESSING
→ SENT
→ ACKNOWLEDGED
→ VERIFYING
→ VERIFIED

Failure states:

RETRYING
FAILED
REQUIRES_ACTION
CONFLICT

Classify errors:

TRANSIENT
RATE_LIMIT
AUTHENTICATION
VALIDATION
NOT_FOUND
CONFLICT
UNKNOWN

Implement idempotency.

A synchronization job must never be marked VERIFIED solely because an outbound HTTP/API operation succeeded.

Implement explicit verification state.

Test:

- timeout
- provider accepted request followed by client timeout
- rate limit
- authentication failure
- validation failure
- conflict

Verify every scenario reaches the correct state.

Do not use fake provider responses for production behavior.
```

---

## 13. PROMPT 13 — PROVIDER ADAPTER ARCHITECTURE

```text
Implement Phase 12: Provider Adapter Framework.

Create the common ChannelAdapter contract specified by the engineering specification.

Support capabilities including:

authenticate()
refreshCredentials()
getAccount()
listProducts()
getProduct()
listOrders()
getOrder()
getInventory()
updateInventory()
registerWebhooks()
verifyWebhook()
parseWebhook()
healthCheck()

Create provider-neutral error normalization.

Create explicit capability detection.

Provider-specific features may extend the common contract.

Do not make a provider appear to support functionality that it does not actually support.

The architecture must isolate:

- Shopify
- Amazon
- eBay
- Walmart

Implement integration interfaces without claiming the providers are already operational.

Add adapter contract tests using the deterministic mock provider.
```

---

## 14. PROMPT 14 — SHOPIFY INTEGRATION

```text
Implement Phase 13: Shopify Adapter.

Use Shopify Admin GraphQL API.

At implementation time, determine the latest stable Shopify Admin GraphQL API version from Shopify's official documentation.

Store the selected version in configuration.

Do not use unstable or release-candidate APIs in production.

Add a provider-version compatibility test or startup validation that clearly reports when the configured version is unsupported.

Implement:

- OAuth installation
- OAuth state validation
- secure token storage/reference
- product import
- variant import
- inventory locations
- inventory retrieval
- inventory updates
- order ingestion
- webhook registration
- webhook validation
- uninstall handling
- rate limiting
- retries
- normalized errors
- provider health

Correctly distinguish:

Shopify Product
Shopify Product Variant
Shopify InventoryItem
Shopify Location

Do not treat these identifiers as interchangeable.

TEST:

- OAuth
- catalog import
- inventory read
- inventory write
- webhook verification
- duplicate webhook
- uninstall
- rate limit
- timeout
- authentication failure

Do not claim Shopify is production-ready until required integration tests pass.
```

---

## 15. PROMPT 15 — SHOPIFY VERIFICATION

```text
Implement Phase 14: Shopify Verification.

Connect Shopify synchronization to the generic synchronization framework.

For an outbound inventory update implement:

internal quantity
→ queued
→ provider update
→ acknowledgement
→ read-back verification where possible
→ VERIFIED or CONFLICT

If Shopify reports a different quantity after the update:

CONFLICT

must be produced.

Do not produce a green success state.

Implement freshness timestamps:

observed_at
received_at
verified_at

Test stale data and verification mismatch scenarios.

Explicitly distinguish:

request submitted
request acknowledged
verification pending
verified
conflict
failed
```

---

## 16. PROMPT 16 — AMAZON INTEGRATION

```text
Implement Phase 15: Amazon Adapter.

Use Amazon Selling Partner API.

For every SP-API model used, determine the currently supported API version from Amazon's official documentation at implementation time. Do not implement deprecated versions.

For every operation, document:

- required authorization role/scope
- marketplace/region applicability
- PII requirements where applicable
- throttling behavior
- retry semantics

Implement:

- seller authorization
- token lifecycle
- marketplace selection
- order retrieval
- inventory retrieval
- inventory updates
- notification integration where appropriate
- throttling
- retries
- normalized errors

Explicitly distinguish seller-fulfilled inventory from FBA inventory.

For MVP prioritize seller-fulfilled inventory.

Do not silently mix FBA and seller-fulfilled quantities.

TEST:

- authorization
- token refresh
- marketplace selection
- order retrieval
- inventory read
- inventory update
- throttling
- notification processing where used
- timeout
- authentication failure
- duplicate event
- reconciliation

Do not call the Amazon integration production-ready until required tests pass.
```

---

## 17. PROMPT 17 — AMAZON VERIFICATION

```text
Implement Phase 16: Amazon Verification.

Connect Amazon to the generic synchronization and verification framework.

Implement:

send
acknowledge
verify
conflict
retry
requires action

Respect Amazon throttling behavior.

Use notifications where appropriate rather than relying exclusively on aggressive polling.

If Amazon architecture prevents immediate read-back, explicitly represent the weaker verification state and its freshness semantics.

Never represent acknowledgement as verification.

Test:

- successful synchronization
- delayed verification
- conflicting read-back
- timeout
- retry
- rate limit
- authentication failure
```

---

## 18. PROMPT 18 — WEBHOOK AND EVENT NORMALIZATION

```text
Implement Phase 17: Webhook and Event Normalization.

Implement the generic webhook pipeline:

Receive
↓
Verify signature
↓
Persist raw event securely
↓
Deduplicate
↓
Acknowledge quickly
↓
Queue processing
↓
Normalize
↓
Apply domain event
↓
Trigger synchronization/reconciliation

Raw webhook payloads must be stored through the configured Supabase Storage layer or equivalent server-side artifact path, with a tenant-aware private bucket where applicable.

Raw webhook payloads must have:

- access controls
- retention limits
- size limits
- appropriate encryption/storage protections
- redaction or minimization where sensitive fields are unnecessary

Create normalized event types:

OrderCreated
OrderUpdated
OrderCancelled
InventoryChanged
ProductChanged
ListingChanged
ReturnCreated
ReturnUpdated
IntegrationChanged

Every event must contain:

event_id
provider
provider_account_id
provider_event_id
event_type
occurred_at
received_at
payload
correlation_id

TEST:

- duplicate events
- out-of-order events
- invalid signatures
- malformed payloads
- delayed events
- provider retries

Long-running work must not occur before provider acknowledgement when the provider expects fast acknowledgement.
```

---

## 19. PROMPT 19 — RECONCILIATION ENGINE

```text
Implement Phase 18: Reconciliation.

Create:

reconciliation_runs
reconciliation_results

Compare internal and external quantities.

Classify results:

MATCH
MINOR_DIFFERENCE
MATERIAL_DIFFERENCE
MISSING_EXTERNAL
MISSING_INTERNAL
STALE_EXTERNAL
UNKNOWN

The reconciliation engine must not automatically assume the external channel is wrong.

Evaluate deterministic causes including:

- delayed update
- external order
- cancellation
- return
- manual marketplace adjustment
- warehouse adjustment
- mapping error
- stale cache
- synchronization failure
- channel-specific inventory logic

CRITICAL MUTATION RULE

A detected external discrepancy must NOT by itself mutate the internal inventory ledger.

The safe flow is:

Detect discrepancy
↓
Classify
↓
Gather evidence
↓
Determine source of truth
↓
Determine safe correction direction
↓
Approval if required
↓
Perform transactional mutation
↓
Synchronize affected channel(s)
↓
Verify external state
↓
Audit

Automatic correction requires:

- known mapping
- known source of truth
- no unresolved competing event
- permitted quantity delta
- no manual lock
- no high-risk state

Otherwise:

REQUIRES_APPROVAL

Create tests for both safe automatic reconciliation and manual approval.
```

---

## 20. PROMPT 20 — EXCEPTION ENGINE

```text
Implement Phase 19: Exception Management.

Implement the exception types defined in the canonical specification.

Lifecycle:

OPEN
→ INVESTIGATING
→ ACTION_REQUIRED
→ RESOLVING
→ RESOLVED

Also support:

OPEN → IGNORED

Every exception must include sufficient information to answer:

WHAT HAPPENED?
WHY?
WHAT IS AFFECTED?
WHAT DID THE SYSTEM TRY?
WHAT HAPPENS NEXT?
WHAT CAN I DO?

Implement:

- retry
- resolve
- ignore
- reconcile

Every mutation must create an audit record.

Test:

- sync failure
- authentication failure
- missing mapping
- duplicate mapping
- negative inventory
- order unmapped SKU
- stale data
- provider outage

Do not mark an exception RESOLVED merely because a retry was submitted; the underlying condition must actually be resolved or explicitly classified according to the exception policy.
```

---

## 21. PROMPT 21 — AUDIT SYSTEM

```text
Implement Phase 20: Audit.

Implement append-only audit logs.

Record:

- organization
- actor type
- actor
- action
- entity type
- entity ID
- before state
- after state
- reason
- request ID
- correlation ID
- timestamp

Audit all material mutations including:

- inventory adjustments
- reconciliation
- mapping changes
- exception resolution
- integration changes
- billing administrative actions
- dangerous bulk operations
- admin actions

Users must not be able to edit historical audit records.

ACCEPTANCE TEST

Given an inventory discrepancy, an administrator must be able to reconstruct:

before
event
actor
reason
after
channel impact
synchronization result
resolution
```

---

## 22. PROMPT 22 — BILLING

```text
Implement Phase 21: Billing.

Use Stripe Billing.

Plans:

STARTER
GROWTH
SCALE
ENTERPRISE

Store entitlements internally.

Do not hard-code entitlement logic into frontend components.

Billing state must follow this architectural path:

Stripe
↓
Verified billing event
↓
Billing domain state
↓
Subscription/entitlement state
↓
Authorization/enforcement

Frontend redirects must never be treated as proof of payment or entitlement.

Handle verified billing events:

- subscription created
- subscription updated
- subscription canceled
- invoice paid
- invoice payment failed
- checkout completed

Implement usage metering for:

- monthly orders
- channels
- warehouses
- users
- API calls
- automation executions
- storage

Implement:

INFO
WARNING
HARD_LIMIT

Do not abruptly disable critical inventory synchronization because of a soft usage threshold.

Test:

- subscription creation
- successful payment
- payment failure
- upgrade
- downgrade
- cancellation
- reactivation
- usage thresholds
```

---

## 23. PROMPT 23 — NOTIFICATIONS

```text
Implement Phase 22: Notifications.

V1 channels:

- in-app
- email

Categories:

- critical inventory conflict
- integration authentication
- repeated sync failure
- low stock
- negative inventory
- reconciliation required
- billing

Deduplicate repeated failures.

For example, if 14 SKUs fail against the same provider over 20 minutes, prefer an incident summary rather than 14 identical emails.

Do not notify users for every successful background operation.

Implement notification preferences where appropriate.

Test notification delivery, deduplication, retry behavior, and failure handling.
```

---

## 24. PROMPT 24 — APPLICATION API CONFORMANCE

```text
Implement Phase 23: Application API Conformance.

The API is built incrementally alongside domain/application services. This phase audits and standardizes the API surface rather than postponing all API implementation until after the backend domains exist.

Base path:

/api/v1

API families:

/auth
/organizations
/products
/inventory
/orders
/integrations
/exceptions
/reconciliation

Success response:

{
  "data": {},
  "meta": {}
}

Error response:

{
  "error": {
    "code": "INVENTORY_CONFLICT",
    "message": "Inventory could not be reconciled.",
    "requestId": "..."
  }
}

Never expose raw internal exceptions.

Implement or verify:

- request validation
- authentication
- authorization
- tenant enforcement
- request IDs
- rate limiting
- secure headers
- input size limits
- cursor pagination

Default page size:

50

Maximum page size:

250

Mutation endpoints that can cause material state changes must support and propagate idempotency keys where applicable.

Test:

- unauthorized requests
- invalid requests
- malformed requests
- cross-tenant requests
- pagination boundaries
- duplicate mutation requests
- idempotency behavior
- rate-limit behavior
```

---

## 25. PROMPT 25 — APPLICATION UI FOUNDATION

```text
Implement Phase 24: Authenticated Application UI Foundation.

The MVP production navigation is:

Overview
Inventory
Orders
Products
Exceptions
Integrations
Settings
Billing

V1/future surfaces such as:

Warehouses
Purchasing
Reports
AI Assistant

must remain feature-flagged and must not appear as operationally available when disabled.

Create reusable components:

DataTable
StatusBadge
MetricCard
ExceptionCard
Timeline
Drawer
Modal
ConfirmDialog
EmptyState
ErrorState
LoadingState
IntegrationCard
InventoryCell

Every production page must support:

loading
empty
success
error
partial failure
permission denied

Do not create one-off duplicates of common components.

Use the established design system.

Do not implement business logic inside presentation components.
```

---

## 26. PROMPT 26 — ONBOARDING

```text
Implement Phase 25: Onboarding.

Flow:

Create account
↓
Create organization
↓
Choose primary sales channel
↓
Connect channel
↓
Import catalog
↓
Map SKUs
↓
Validate inventory
↓
Enable synchronization
↓
Dashboard

CRITICAL SAFETY REQUIREMENT

Never enable destructive outbound synchronization immediately after connecting a channel.

Mandatory initial synchronization flow:

IMPORT
↓
COMPARE
↓
SHOW DIFFERENCES
↓
USER CONFIRMS SOURCE OF TRUTH
↓
ENABLE OUTBOUND SYNC

Example:

Internal = 20
Shopify = 20
Amazon = 18

The UI must show the discrepancy.

It must not silently overwrite Amazon.

Implement explicit source-of-truth selection.

Require confirmation before enabling outbound synchronization.

Test the onboarding flow end-to-end.
```

---

## 27. PROMPT 27 — INVENTORY UI

```text
Implement Phase 26: Inventory UI.

The inventory table must show:

SKU
Product
Warehouse
On Hand
Reserved
Available
Connected Channel Quantities
Status

Connected channel columns must be dynamic. Do not present eBay or Walmart as operational channels when those integrations are not enabled.

Filters:

- channel
- warehouse
- low stock
- mismatch
- sync state
- product
- SKU

Use server-side pagination and filtering.

Implement SKU detail sections:

Summary
Inventory by Warehouse
Inventory by Channel
Synchronization
Exceptions
Timeline
Orders
Audit

The timeline must make inventory explainable.

Use explicit status semantics:

LIVE
VERIFIED
STALE
CONFLICT
UNKNOWN

Do not use a green success state for data that has merely been submitted to a provider.

Implement responsive behavior and WCAG-compatible interactions.
```

---

## 28. PROMPT 28 — EXCEPTION UI

```text
Implement Phase 27: Exception UI.

Create the Exception Inbox.

Filters:

Critical
High
Medium
Low
Resolved
Open
Inventory
Orders
Integrations

Sort by:

severity
age
impact

Exception detail must answer:

What happened?
Why?
What is affected?
What did the system try?
What happens next?
What can I do?

Display:

SKU
Internal quantity
External quantity
Difference
Last verified update
Likely cause
Retry state
Affected channel
Recommended action

If a cause is inferred rather than proven, label it as an inference.

Actions:

Retry
Investigate
Reconcile
Resolve
Ignore

Require confirmation for dangerous operations.

Do not represent an exception as resolved until the underlying state is actually resolved.
```

---

## 29. PROMPT 29 — INTEGRATION UI

```text
Implement Phase 28: Integration UI.

Each integration must display:

Provider
Account
Status
Last sync
Last error
Pending jobs
Failed jobs
Webhook health

Actions:

Sync Now
Reconnect
Disconnect

Health states:

CONNECTED
DEGRADED
AUTH_REQUIRED
RATE_LIMITED
ERROR
DISCONNECTED

Never display CONNECTED when credentials are invalid.

Display data freshness.

Distinguish:

last request
last successful synchronization
last verified synchronization
last webhook
last error

Disconnect must require confirmation and explain the operational consequences.
```

---

## 30. PROMPT 30 — OPERATIONAL DASHBOARD

```text
Implement Phase 29: Dashboard.

The Overview page is operational mission-control software.

Prioritize:

Inventory Health
Critical Exceptions
Synchronization Health
Low Stock
Recent Inventory Events
Channel Health

Display:

Total SKUs
Total on-hand inventory
Reserved inventory
Available inventory
Connected-channel health
Open exceptions
Synchronization status

Only display provider-specific health for connected/enabled integrations.

Avoid decorative charts.

Every metric must come from actual application data.

Do not fabricate dashboard values.

Every external health state must have a freshness indicator.

The dashboard should make the most operationally important problem obvious without requiring users to inspect multiple pages.
```

---

## 31. PROMPT 31 — SECURITY HARDENING

```text
Implement Phase 30: Security Hardening.

Perform a dedicated security review.

Test:

tenant breakout
privilege escalation
CSRF
XSS
SQL injection
invalid OAuth state
webhook forgery
token leakage
session fixation
brute force
rate-limit bypass
file upload abuse where applicable

Verify:

- TLS expectations
- secret handling
- encrypted/reference credential storage
- Supabase secret/service-role (legacy) keys never reach frontend payloads
- Supabase publishable keys are used only with appropriate RLS/grants
- marketplace credentials never reach frontend payloads
- secure headers
- input validation
- authorization
- audit coverage
- dependency scanning
- secret scanning

For import/upload surfaces verify appropriate:

- file size limits
- type/content validation
- CSV/XLSX handling protections including spreadsheet formula injection where relevant
- storage authorization
- signed-download authorization where used

Search the repository for:

- hard-coded credentials
- tokens
- passwords
- development-only authentication
- debug endpoints
- disabled security checks
- insecure TODO bypasses

Fix critical security findings before marking the phase VERIFIED.

Run the security test suite.
```

---

## 32. PROMPT 32 — OBSERVABILITY

```text
Implement Phase 31: Observability.

Use OpenTelemetry-compatible tracing plus structured logs and metrics.

Every request gets:

request_id

Every asynchronous operation gets:

job_id
correlation_id

Every external provider call records:

provider
operation
latency
status
error_class
correlation_id

Never log:

- access tokens
- refresh tokens
- passwords
- payment secrets
- unnecessary sensitive customer information

Track:

sync_success_rate
sync_verification_rate
sync_latency
sync_failure_rate
webhook_success_rate
webhook_processing_latency
reconciliation_match_rate
reconciliation_auto_resolution_rate
inventory_conflict_rate
negative_inventory_rate
order_import_success_rate
queue_depth
job_failure_rate

Create configurable alerts for:

- synchronization failure spikes
- queue backlog
- webhook processing failures
- provider error spikes
- database errors
- reconciliation failures
- abnormal authentication failures
```

---

## 33. PROMPT 33 — MOCK PROVIDER AND FAILURE TESTING

```text
Implement Phase 32: Deterministic Mock Provider.

Create an internal fake marketplace adapter exclusively for testing.

It must simulate:

successful sync
timeout
rate limit
authentication failure
duplicate webhook
delayed webhook
wrong quantity
provider outage

Keep it completely separated from production provider implementations.

Use it for repeatable synchronization and failure tests.

The mock provider must never be automatically selected as a production fallback.

Production must fail explicitly when the real provider is unavailable.

Add configuration/injection tests proving that production configuration cannot resolve the mock provider.

Test that no mock data can leak into production behavior.
```

---

## 34. PROMPT 34 — COMPLETE INVENTORY TEST SUITE

```text
Implement Phase 33: Complete Critical Inventory Test Suite.

Required scenarios:

1. Concurrent order

Two orders attempt to reserve one remaining unit.

Expected:
One succeeds.
One fails or resolves according to configured behavior.
Inventory remains correct.

2. Duplicate webhook

Expected:
One logical mutation.

3. Out-of-order event

Expected:
Inventory remains logically consistent.

4. Sync retry

Provider accepts update but client times out.

Expected:
Retry remains idempotent.
No duplicate logical mutation.

5. External discrepancy

Expected:
Conflict detected.
Exception created.

6. Verification mismatch

Internal quantity = 17.

Provider acknowledges update to 17 but read-back reports 15.

Expected:
CONFLICT

Never:
VERIFIED

Also test:

- negative inventory
- manual adjustment
- reservation release
- cancellation
- return
- warehouse transfer
- reconciliation correction
- idempotency
- tenant isolation

Run the full suite and report actual results.
```

---

## 35. PROMPT 35 — END-TO-END ACCEPTANCE

```text
Implement Phase 34: End-to-End Acceptance.

Run the full business flow:

signup
↓
organization creation
↓
connect Shopify
↓
connect Amazon
↓
import products
↓
map SKUs
↓
validate initial inventory
↓
confirm source of truth
↓
enable synchronization
↓
import order
↓
reserve inventory
↓
synchronize inventory
↓
verify external state
↓
create discrepancy
↓
detect discrepancy
↓
create exception
↓
reconcile
↓
resolve
↓
audit complete lifecycle

No step may depend on fake production behavior.

Use real provider test/sandbox environments where supported. Where a provider cannot provide a safe test environment for a scenario, use the deterministic mock only for that scenario and explicitly label the evidence class.

Capture test evidence.

If a step fails, investigate and fix the underlying implementation before declaring the phase VERIFIED.
```

---

## 36. PROMPT 36 — BILLING ACCEPTANCE

```text
Implement Phase 35: Billing Acceptance.

Execute and verify:

new subscription
payment success
payment failure
upgrade
downgrade
cancellation
reactivation
usage threshold

Verify that billing state is driven by verified billing-provider events.

Verify that frontend redirects cannot independently grant entitlements.

Test plan enforcement.

Test soft thresholds.

Test hard limits.

Ensure critical inventory synchronization is not unexpectedly disabled because of a soft usage threshold.

Record all billing state transitions required for auditability.
```

---

## 37. PROMPT 37 — DATA EXPORT AND ACCOUNT DELETION

```text
Implement Phase 36: Data Export and Account Deletion.

Organization-level export must include:

products
SKUs
inventory
orders
exceptions
audit data
integration mappings

Implement account deletion workflow:

warn
confirm
offer export
disable integrations
stop background jobs
revoke credentials where possible
delete/anonymize according to retention policy
record deletion event

Ensure marketplace credentials do not remain active after account deletion.

Test deletion while:

- sync jobs are pending
- integrations are connected
- exports exist
- billing is active
- exceptions are unresolved

Exports must enforce tenant authorization and safe file handling.
```

---

## 38. PROMPT 38 — REPORTING AND EXPORTS

```text
Implement Phase 37: Reporting and Exports.

V1 reports:

inventory value
inventory by warehouse
inventory by channel
low stock
stockouts
synchronization health
discrepancy history
order volume

Implement asynchronous exports for:

Products
SKUs
Inventory
Orders
Exceptions
Reconciliation
Audit logs

Formats:

CSV
XLSX where useful

Large exports must run asynchronously.

Do not block HTTP requests while generating large reports.

Reports must derive from transactional data.

Never use fake analytics values.

Protect exported data with tenant authorization, Supabase Storage private-bucket policies, retention controls, and safe signed-download authorization where used. Do not expose export buckets publicly.
```

---

## 39. PROMPT 39 — PUBLIC WEBSITE

```text
Implement Phase 38: Public Website.

Keep public marketing architecture separate from the authenticated application.

Public routes:

/
/pricing
/integrations
/compare/*
/alternatives/*
/solutions/*
/guides/*
/tools/*
/docs/*

Application routes:

/app/*

Public navigation:

Product
Solutions
Integrations
Pricing
Compare
Migration
Resources
Docs

Sign In
Start Free

Use the canonical positioning:

"Inventory you can trust across every sales channel."

Subheadline:

"One source of truth for ecommerce inventory, with verified synchronization, discrepancy detection and automated reconciliation."

Do not fabricate:

- testimonials
- statistics
- customer claims
- certifications
- integrations
- product capabilities

Do not create competitor/alternative pages merely because the URL exists. Every comparison/alternative page must contain maintained, factual content with clearly distinguished facts, product claims, third-party claims, and unknowns.

Authenticated application routes should normally be noindex.
```

---

## 40. PROMPT 40 — SEO AND GEO

```text
Implement Phase 39: SEO and GEO.

Implement:

- SSR/SSG where appropriate
- canonical URLs
- XML sitemap
- robots.txt
- metadata
- Open Graph
- semantic HTML
- breadcrumbs
- valid structured data where applicable
- internal linking
- image optimization
- 404 handling
- redirects
- appropriate indexing controls

Create useful public page types specified by the canonical document.

Important pages should clearly communicate:

What is this?
Who is it for?
Supported channels
Pricing
Features
Limitations
Integrations
FAQ
Documentation
Migration

Do not generate thousands of low-value programmatic pages.

Do not generate competitor pages without substantive maintained content.

Do not fabricate SEO statistics, testimonials, reviews, or competitor claims.

Ensure authenticated application routes do not compete with public pages in search.
```

---

## 41. PROMPT 41 — DOCUMENTATION

```text
Implement Phase 40: Documentation.

Create:

Architecture document
Database schema document
API reference
Provider integration guides
Deployment guide
Rollback guide
Incident response guide
Security guide
Customer onboarding guide
Migration guide

Public documentation:

/docs/getting-started
/docs/inventory
/docs/orders
/docs/integrations
/docs/reconciliation
/docs/api
/docs/security
/docs/billing

Documentation must reflect the actual implementation.

Do not document capabilities that do not exist.

Include limitations and provider-specific constraints where applicable.
```

---

## 42. PROMPT 42 — ENGINEERING RUNBOOKS

```text
Implement Phase 41: Engineering Runbooks.

Create runbooks for:

Shopify outage
Amazon outage
eBay outage
Walmart outage
Database outage
Queue backlog
Webhook failure
Credential expiry
Mass inventory discrepancy
Bad deployment
Billing incident

Each runbook must contain:

Symptoms
Detection
Immediate containment
Investigation
Safe remediation
Verification
Rollback/escalation
Communication
Post-incident actions

Runbooks must be operationally actionable rather than generic prose.
```

---

## 43. PROMPT 43 — BACKUPS AND DISASTER RECOVERY

```text
Implement Phase 42: Backups and Disaster Recovery.

Establish production database backup strategy.

Verify:

- automated backups
- point-in-time recovery where supported by the Supabase plan/configuration
- Supabase backup/restore documentation and project configuration verification
- backup verification
- documented restore procedure

Actually execute a restoration test against the supported Supabase recovery/restore mechanism or a documented equivalent test environment.

Do not claim a recovery capability merely because backups are enabled. The restore path must be exercised and evidence captured.

Record:

backup test
restore test
result
date
environment
failure encountered
remediation
RPO achieved
RTO achieved
data-loss window
restore duration

Do not claim disaster recovery readiness merely because backups exist.

The restore procedure must be documented and repeatable.
```

---

## 44. PROMPT 44 — CI/CD

```text
Implement Phase 43: CI/CD.

Every pull request must run:

typecheck
lint
unit tests
integration tests
build
security checks

Main branch:

build
test
deploy staging
smoke test

Production:

approved release
deploy
health check
rollback capability

Handle database migrations safely.

Use an expand/contract strategy for production schema changes where compatibility or rollback requires it:

Expand
↓
Deploy backward-compatible application
↓
Backfill/migrate data
↓
Switch reads/writes
↓
Contract/remove obsolete structures only after safe cutover

Do not allow an incompatible migration to deploy alongside application code that expects a different schema.

Implement deployment health checks.

Verify rollback behavior.
```

---

## 45. PROMPT 45 — PERFORMANCE AND SCALE REVIEW

```text
Implement Phase 44: Performance and Scale Review.

Review the entire system for:

- database query efficiency
- missing indexes
- N+1 queries
- unnecessary frontend JavaScript
- large payloads
- queue starvation
- provider throttling
- tenant fairness
- pagination
- cache semantics

Large datasets must use:

cursor pagination
background jobs
indexed queries

Do not load an entire organization's order history into the browser.

Do not introduce Elasticsearch/OpenSearch unless actual scale requires it.

Review database query plans for important production paths.

Review worker scheduling so one large merchant cannot monopolize provider queues.
```

---

## 46. PROMPT 46 — ACCESSIBILITY AND UX QUALITY

```text
Implement Phase 45: Accessibility and UX Quality Review.

Perform a WCAG 2.2 AA review.

Verify:

- keyboard navigation
- visible focus states
- labels
- semantic HTML
- accessible tables
- accessible dialogs
- accessible alerts
- sufficient contrast
- screen-reader compatibility

Review visual design against:

Professional
Technical
Trustworthy
Operational
Minimal
Fast

Avoid:

- excessive gradients
- meaningless animations
- excessive glassmorphism
- decorative charts
- visual clutter

The application should feel like mission-control software.

Pay special attention to operational states:

LIVE
VERIFIED
STALE
CONFLICT
UNKNOWN

Users must understand the difference immediately.
```

---

## 47. PROMPT 47 — DANGEROUS OPERATIONS

```text
Implement Phase 46: Dangerous Operations Safety.

Audit:

- bulk inventory adjustment
- bulk SKU remapping
- bulk deletion
- channel disconnection
- mass reconciliation
- large inventory correction

Every dangerous operation must:

1. Show scope.
2. Show affected count.
3. Explain consequences.
4. Require explicit confirmation.
5. Execute asynchronously where appropriate.
6. Create an audit record.
7. Report partial failures.
8. Be cancellable where feasible.

Example:

"This action will update 1,284 SKUs across Amazon."

Never hide the operational scope.

Test authorization and confirmation requirements for every dangerous operation.

Material mutation endpoints must also enforce idempotency server-side; UI confirmation is not a substitute for authorization or idempotency.
```

---

## 48. PROMPT 48 — PARTIAL FAILURE

```text
Implement Phase 47: Partial Failure Handling.

All bulk and asynchronous workflows must support partial outcomes.

Example:

1,000 total
982 successful
12 retrying
6 failed

The UI must NOT simply display:

"Successful"

when partial failures exist.

Implement explicit:

PARTIAL

state.

Expose:

- total
- successful
- retrying
- failed
- cancelled
- remaining

Allow the user to inspect individual failures.

Ensure partial failures are auditable.
```

---

## 49. PROMPT 49 — FEATURE FLAGS

```text
Implement Phase 48: Feature Flag Review.

Use organization-aware feature flags for unfinished or staged functionality.

Review flags for:

- new integrations
- AI
- automatic reconciliation
- new allocation algorithms
- migration tools
- Walmart
- advanced warehouse
- advanced purchasing
- advanced reports

Do not expose unfinished functionality as production-ready.

Feature flags must be evaluated server-side for security-sensitive functionality.

Do not use frontend-only feature flags to protect backend capabilities.

Disabled features must not expose operational-looking routes or APIs that bypass the flag.
```

---

## 50. PROMPT 50 — AI ASSISTANT FOUNDATION

```text
Implement Phase 49: AI Assistant only if the feature is enabled and the core inventory-control MVP is already verified.

AI is a secondary interface over deterministic system data. It is not part of the minimum production-critical synchronization path.

Allowed:

Explain
Search
Summarize
Diagnose
Recommend
Prepare action

AI must never become the source of truth.

Implement:

Natural language request
↓
Intent classification
↓
Permission check
↓
Deterministic tool call
↓
Validation
↓
Confirmation if required
↓
Mutation
↓
Audit log

AI cannot:

- execute arbitrary SQL
- directly execute arbitrary provider API calls
- bypass permissions
- invent inventory state

AI responses must distinguish:

Observed fact
Inference
Recommendation
Unknown

Example:

Observed: eBay currently reports 15 units.

Observed: The last outbound update attempted to set 17 units.

Likely cause: The update was not acknowledged.

Recommendation: Retry reconciliation.

Do not state inference as fact.

If the AI feature is disabled, it must not expose production mutation endpoints or bypass server-side feature/permission checks.
```

---

## 51. PROMPT 51 — MIGRATION

```text
Implement Phase 50: Migration.

V1 migration:

- CSV import
- generic inventory import

Pipeline:

Upload
↓
Detect
↓
Map
↓
Validate
↓
Conflict report
↓
Preview
↓
Confirm
↓
Import
↓
Verify

Never silently discard unmapped records.

Show:

- imported records
- rejected records
- unmapped records
- conflicts
- warnings
- final verification result

Prepare architecture for future:

Ecomdash
Sellbrite
Veeqo
Zoho Inventory

Do not claim those migrations exist until actually implemented and tested.

All import paths must follow the security controls established for file uploads and tenant isolation.
```

---

## 52. PROMPT 52 — ADMIN AND SUPPORT CONSOLE

```text
Implement Phase 51: Internal Admin and Support Console.

Authorized internal staff should be able to inspect:

Organizations
Users
Subscriptions
Integrations
Sync Jobs
Exceptions
System Health
Feature Flags
Audit

Support inspection must include:

Organization
Integration health
Recent jobs
Recent exceptions
SKU history
Inventory events
Audit history

Never expose marketplace secrets.

All admin mutations require:

- explicit authorization
- audit logging
- action context

Admin tools must not silently bypass normal safety controls.

Access to support/admin tooling must be tenant-scoped or explicitly justified by an audited privileged support role.
```

---

## 53. PROMPT 53 — FINAL TENANT ISOLATION AUDIT

```text
Implement Phase 52: Final Tenant Isolation Audit.

Create multiple organizations with overlapping:

- SKUs
- products
- orders
- integrations
- warehouses
- exceptions

Attempt cross-tenant access through:

- REST endpoints
- query parameters
- path IDs
- background jobs
- queue messages
- exports
- admin endpoints
- realtime endpoints if any
- Supabase Data API paths if exposed
- Supabase Storage bucket/object paths
- RLS policy paths
- service-layer calls

Every unauthorized access must fail.

Do not rely on frontend filtering.

Inspect every tenant-scoped database query and service method.

Fix any path that can access another organization without explicit authorization.

Do not mark the tenant-isolation audit VERIFIED until automated tests and code inspection evidence exist.
```

---

## 54. PROMPT 54 — FINAL PROVIDER INTEGRATION AUDIT

```text
Implement Phase 53: Final Provider Integration Audit.

For every implemented production provider verify:

authentication
catalog import
inventory read
inventory write
order import
webhook
rate limit
timeout
authentication failure
duplicate event
reconciliation
verification
health monitoring

Classify every capability:

IMPLEMENTED AND VERIFIED
IMPLEMENTED BUT NOT VERIFIED
NOT IMPLEMENTED
NOT SUPPORTED BY PROVIDER

Never convert "implemented but not verified" into "complete".

Do not claim unsupported provider functionality.

Produce a provider-by-provider verification matrix.

Evidence must identify whether each result came from:

UNIT
INTEGRATION-MOCK
PROVIDER-SANDBOX
PROVIDER-LIVE-TEST
E2E

Mock-provider evidence alone cannot establish that a real provider integration is operational.
```

---

## 55. PROMPT 55 — FINAL PRODUCT TRUST AUDIT

```text
Implement Phase 54: Final Product Trust Audit.

Audit every UI surface for misleading status indicators.

Search for places where the UI says:

Success
Synced
Connected
Verified
Healthy
Complete

For each state determine whether it is backed by actual evidence.

Correct any case where:

request success

is incorrectly represented as:

verified external state

Every external quantity must support:

observed_at
received_at
verified_at

Users must distinguish:

LIVE
VERIFIED
STALE
CONFLICT
UNKNOWN

Do not use green checkmarks for unverified data.

Audit dashboard metrics, inventory tables, integration pages, exceptions, notifications, and synchronization history.
```

---

## 56. PROMPT 56 — FINAL INVENTORY INTEGRITY AUDIT

```text
Implement Phase 55: Final Inventory Integrity Audit.

Search the entire repository for every mutation of:

on_hand
reserved
allocated
damaged
quarantined
in_transit
incoming
safety_stock

Verify that every mutation passes through the Inventory domain and appropriate transactional controls.

Find and eliminate:

- direct inventory SQL mutations from unrelated modules
- frontend-driven inventory mutation
- unlogged adjustments
- non-idempotent retries
- race conditions
- silent negative clamping
- silent discrepancy correction
- fake inventory state

Verify that every material inventory mutation has:

- transaction safety
- inventory event
- actor/source
- reason where applicable
- correlation ID
- idempotency
- auditability

Run all inventory integrity tests after remediation.
```

---

## 57. PROMPT 57 — FINAL SECURITY AUDIT

```text
Implement Phase 56: Final Security Audit.

Perform a complete security assessment across:

authentication
authorization
tenant isolation
OAuth
webhooks
secrets
sessions
CSRF
XSS
SQL injection
rate limiting
input validation
admin access
exports
file uploads
billing
logging

Search source code for:

- secrets
- tokens
- passwords
- insecure TODO bypasses
- development-only authentication
- debug endpoints
- mock providers accidentally enabled
- disabled security checks
- unsafe type escapes that bypass important guarantees

Run automated security scanning.

Fix all critical findings.

Fix high-severity findings before release unless explicitly documented and accepted.

Provide a security findings matrix.
```

---

## 58. PROMPT 58 — FINAL OBSERVABILITY AUDIT

```text
Implement Phase 57: Final Observability Audit.

Verify that important operations can be traced end-to-end.

A support engineer should be able to trace:

user action
↓
API request
↓
domain operation
↓
database transaction
↓
job
↓
provider request
↓
provider response
↓
verification
↓
exception/reconciliation

using:

request_id
correlation_id
job_id

without exposing secrets.

Verify structured logs.

Verify metrics.

Verify traces.

Verify alerts.

Verify dashboards.

Verify provider operation visibility.

Verify queue visibility.

Verify inventory conflict visibility.

Test that a simulated failed synchronization can be traced from the UI-facing operation to the provider error and resulting exception.
```

---

## 59. PROMPT 59 — FINAL END-TO-END BUSINESS SCENARIO

```text
Implement Phase 58: Final End-to-End Business Scenario.

Execute this complete real application flow:

Merchant signs up
↓
Creates organization
↓
Connects Shopify
↓
Connects Amazon
↓
Imports catalog
↓
Maps SKUs
↓
Imports inventory
↓
Finds initial discrepancy
↓
Reviews discrepancy
↓
Chooses source of truth
↓
Enables synchronization
↓
Receives order
↓
Reserves inventory
↓
Synchronizes channel inventory
↓
Verifies update
↓
Provider later reports conflicting quantity
↓
Conflict is detected
↓
Exception is created
↓
Merchant investigates
↓
Reconciliation is executed
↓
Correction is approved
↓
External quantity is updated
↓
External state is verified
↓
Exception is resolved
↓
Audit trail reconstructs entire lifecycle

No step may depend on fake production behavior.

Use real provider test/sandbox environments where supported. Where a provider cannot safely exercise a scenario, use the deterministic mock only for that scenario and explicitly label the evidence class.

Capture actual test evidence.

If any step fails, diagnose and fix the implementation before declaring the scenario VERIFIED.
```

---

## 60. PROMPT 60 — FINAL DEFINITION-OF-DONE AUDIT

```text
Implement Phase 59: Final Definition-of-Done Audit.

Compare the implementation against Section 150 of the canonical engineering specification.

Evaluate:

PRODUCT

- organization creation
- authentication
- billing
- product catalog
- SKU mapping

INVENTORY

- inventory ledger
- reservations
- concurrency
- manual adjustments
- audit trail

SHOPIFY

- OAuth
- catalog import
- inventory read
- inventory write
- webhook processing
- verification

AMAZON

- authorization
- order import
- inventory workflow
- throttling
- notification/polling strategy
- verification/reconciliation

SYNCHRONIZATION

- queue
- retry
- idempotency
- failure classification
- partial failure
- verification

RECONCILIATION

- discrepancy detection
- exception creation
- manual resolution
- safe automatic resolution
- audit

SECURITY

- tenant isolation
- RBAC
- OAuth security
- webhook security
- secrets

OPERATIONS

- logging
- monitoring
- alerting
- backups
- restoration testing
- rollback

WEB

- public site
- SEO architecture
- documentation
- pricing
- legal pages
- app protection/noindex

TESTING

- critical inventory paths
- integration tests
- E2E tests
- failure tests
- security tests

For every requirement report:

PASS
PARTIAL
FAIL
DEFERRED
NOT APPLICABLE

Every PASS must have implementation and test evidence.

Also report whether each item is:

IMPLEMENTED
VERIFIED
PRODUCTION READY

Do not use subjective "looks good" conclusions.
```

---

## 61. PROMPT 61 — FINAL PRINCIPAL ARCHITECT REVIEW

```text
Act now as:

- Principal Software Architect
- Senior Full-Stack Engineer
- Senior QA Engineer
- Security Engineer
- Principal UI/UX Designer
- Site Reliability Engineer

Do not immediately modify the code.

First inspect the entire implementation.

Review:

ARCHITECTURE

- dependency direction
- domain boundaries
- scalability
- maintainability
- failure isolation
- provider abstraction

INVENTORY CORRECTNESS

- concurrency
- transactions
- reservations
- idempotency
- event ordering
- reconciliation
- explainability

INTEGRATIONS

- authentication
- provider capabilities
- throttling
- webhook handling
- verification
- error handling

SECURITY

- tenant isolation
- RBAC
- OAuth
- secrets
- webhook validation
- session security
- injection vulnerabilities

BACKEND

- API design
- validation
- transactions
- background jobs
- database queries
- pagination

FRONTEND

- information architecture
- accessibility
- operational clarity
- error states
- stale/conflict states
- responsive behavior
- component reuse

UX

Specifically inspect whether the interface answers:

What happened?
Why?
What is affected?
What did the system try?
What happens next?
What can I do?

OPERATIONS

- monitoring
- alerting
- backups
- recovery
- deployment
- rollback
- runbooks

TESTING

- unit
- integration
- E2E
- provider
- concurrency
- failure
- security

Do not praise the implementation merely because the happy path works.

Produce:

CRITICAL FINDINGS
HIGH PRIORITY FINDINGS
MEDIUM PRIORITY FINDINGS
LOW PRIORITY FINDINGS

ARCHITECTURAL RISKS
DATA-INTEGRITY RISKS
SECURITY RISKS
UX RISKS
PERFORMANCE RISKS
OPERATIONAL RISKS

MISSING REQUIREMENTS
INCORRECT IMPLEMENTATIONS
DUPLICATED LOGIC
MOCKED/PLACEHOLDER FUNCTIONALITY
UNVERIFIED CLAIMS

RECOMMENDED REMEDIATION ORDER

Do not modify anything until the review is complete.
```

---

## 62. PROMPT 62 — FINAL REMEDIATION

```text
Using the findings from the Principal Architect Review, remediate the implementation.

Fix every:

CRITICAL
HIGH

finding.

Also fix MEDIUM findings when they affect:

- inventory correctness
- security
- tenant isolation
- production reliability
- misleading UX
- synchronization integrity

Do not introduce unrelated features.

For every remediation:

1. Identify root cause.
2. Implement the fix.
3. Add or update tests.
4. Run affected tests.
5. Run typecheck.
6. Run lint.
7. Run build.
8. Verify no regression.
9. Update documentation where behavior changed.

After remediation produce:

Finding
Root cause
Fix
Files changed
Tests added
Tests executed
Result
Evidence class

Do not declare remediation VERIFIED until affected acceptance tests pass.
```

---

## 63. PROMPT 63 — FINAL PRODUCTION READINESS GATE AND RELEASE REPORT

```text
This is the final production-readiness gate.

Do not make assumptions.

Verify all of the following:

SHOPIFY

- integration passes
- authentication works
- catalog import works
- inventory read works
- inventory write works
- webhook processing works
- verification works

AMAZON

- authorization works
- order import works
- inventory workflow works
- throttling works
- notification/polling strategy works
- verification works
- reconciliation works

SYNCHRONIZATION

- queue works
- retry works
- idempotency works
- error classification works
- partial failure works
- verification works

RECONCILIATION

- discrepancy detection works
- exceptions work
- manual resolution works
- safe automatic resolution works where configured
- audit works

SECURITY

- tenant isolation tested
- RBAC tested
- OAuth security tested
- webhook security tested
- secrets protected

OPERATIONS

- logging works
- monitoring works
- alerting works
- backups work
- restoration has been tested
- rollback exists

WEB

- public site works
- SEO architecture works
- documentation works
- pricing works
- legal pages exist
- app routes are protected/noindexed appropriately

TESTING

- critical inventory paths have automated tests
- provider tests pass
- failure tests pass
- security tests pass
- E2E tests pass

If any critical requirement fails, report:

NOT PRODUCTION READY

and list the exact blockers.

Do not redefine acceptance criteria to achieve a passing result.

If all required criteria genuinely pass, produce the final engineering release report:

Product version
Release date
Environment
Implemented capabilities
Verified integrations
Known limitations
Deferred capabilities
Feature flags
Database migration status
Test results
Security test results
Performance results
Observability status
Backup/restore status
Rollback procedure
Open incidents
Production-readiness status

Then produce the final requirement traceability matrix:

Specification section
Requirement
Implementation location
Test coverage
Verification status
Status

Use only:

PASS
PARTIAL
FAIL
DEFERRED
NOT APPLICABLE

Every PASS must have evidence.

FINAL ARCHITECTURAL PRINCIPLE

The platform must remain fundamentally:

A transactional inventory-control and synchronization system with reconciliation intelligence.

It must not degrade into:

A dashboard that connects ecommerce stores.

That distinction is an architectural invariant.
```

---

# EXECUTION CHECKLIST

Use this order exactly:

01 Master Operating Contract
02 Repository & Architecture
03 Infrastructure
04 Database
05 Authentication
06 Organizations & RBAC
07 Domain Models
08 Inventory Ledger
09 Reservations
10 Orders
11 Job System
12 Synchronization Framework
13 Provider Adapter Architecture
14 Shopify Integration
15 Shopify Verification
16 Amazon Integration
17 Amazon Verification
18 Webhooks & Event Normalization
19 Reconciliation
20 Exception Engine
21 Audit
22 Billing
23 Notifications
24 Application API Conformance
25 Application UI Foundation
26 Onboarding
27 Inventory UI
28 Exception UI
29 Integration UI
30 Operational Dashboard
31 Security Hardening
32 Observability
33 Mock Provider Testing
34 Critical Inventory Tests
35 End-to-End Acceptance
36 Billing Acceptance
37 Data Export & Deletion
38 Reporting & Exports
39 Public Website
40 SEO & GEO
41 Documentation
42 Runbooks
43 Backups & Disaster Recovery
44 CI/CD
45 Performance & Scale
46 Accessibility & UX
47 Dangerous Operations
48 Partial Failure
49 Feature Flags
50 AI Assistant
51 Migration
52 Admin & Support
53 Tenant Isolation Audit
54 Provider Integration Audit
55 Product Trust Audit
56 Inventory Integrity Audit
57 Security Audit
58 Observability Audit
59 Final E2E Scenario
60 Definition-of-Done Audit
61 Principal Architect Review
62 Final Remediation
63 Production Readiness & Release

### SECTION 151 RECONCILIATION

The 63 prompts are a finer-grained execution sequence derived from the canonical 30-step order in Section 151. They do not replace that order.

In particular:

- API conformance is cross-cutting and is audited after the core backend domains exist.
- UI prompts implement the canonical dashboard/product/inventory/integration surfaces after their underlying behavior exists.
- Critical tests are written throughout the sequence; Prompt 34 consolidates the critical inventory suite, and Prompt 35 performs the business E2E gate.
- AI remains optional and feature-flagged; it is not part of the production-critical inventory synchronization path.
- eBay and Walmart remain architectural/provider boundaries unless actually implemented and verified.
- Migration and production deployment remain later-stage concerns.
- A later prompt may not implement a dependency that the canonical Section 151 requires earlier.

---

# FINAL ANTIGRAVITY OPERATING RULE

Do not skip directly to later prompts because a later feature appears easier to implement.

The prompt pack is sequential, but the canonical engineering specification remains the architectural source of truth. Where the 63 prompts split one canonical phase into multiple gates, those gates must be treated as one dependency stage rather than as permission to bypass an earlier canonical dependency.

For every phase:

1. inspect
2. identify dependencies
3. implement
4. test
5. validate
6. report status and evidence
7. proceed only when the phase's required gate is satisfied

A feature may be IMPLEMENTED before it is VERIFIED.

A feature may be VERIFIED before it is PRODUCTION READY.

Do not collapse these states.

---

# FINAL ARCHITECTURAL INVARIANT

The platform must remain:

**A transactional inventory-control and synchronization system with reconciliation intelligence.**

It must not degrade into:

**A dashboard that connects ecommerce stores.**

The fundamental product invariant remains:

**Inventory must be explainable.**

For every material inventory quantity, the system must be able to answer:

- What is the quantity?
- Where is it?
- When did it change?
- Why did it change?
- Which event caused it?
- Which user/system caused it?
- Which channels received the change?
- Which channels verified it?
- Is there a discrepancy?
- Can it be safely corrected?

END OF VERIFIED SUPABASE-ALIGNED PROMPT PACK

---

# PACK INTEGRITY CHECKS

This revision has been statically verified for:

- exactly 63 numbered prompts
- continuous numbering 01–63
- balanced prompt code fences
- explicit IMPLEMENTED / VERIFIED / PRODUCTION READY status model
- Supabase Postgres/Auth/Storage platform boundary
- Supabase RLS and secret-key handling requirements
- Supabase migration/auth/session/storage integration requirements
- canonical Section 150 definition-of-done reference
- canonical Section 151 order reconciliation
- reconciliation mutation safety
- API mutation idempotency
- real-provider evidence classification
- mock-provider production isolation
- dynamic connected-channel UI behavior
- AI feature gating
- secure file/import handling requirements
- expand/contract database migration guidance
- disaster-recovery evidence requirements
- final production-readiness gate

END OF PACK INTEGRITY CHECKS
