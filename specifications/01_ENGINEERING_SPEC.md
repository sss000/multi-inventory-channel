# FINAL ENGINEERING SPECIFICATION V2 — Multichannel Inventory Control Platform

## 0. DOCUMENT STATUS

This document supersedes all previous product/build prompts for this project.

It is the canonical implementation specification.

Anti Gravity must treat this as an engineering contract, not as a collection of suggestions.

Where this specification says **MUST**, the requirement is mandatory.

Where it says **SHOULD**, implement unless there is a documented technical reason not to.

Where it says **MAY**, implementation is optional.

Do not silently remove requirements.

Do not substitute mock functionality for production functionality while representing it as complete.

Do not invent marketplace capabilities.

Do not claim an integration is operational until it has passed its integration acceptance tests.

---

## 1. PRODUCT

Build a multi-tenant SaaS platform for ecommerce merchants selling through multiple sales channels.

Working product category:

**Multichannel Inventory Control**

Core promise:

> Know what inventory you actually have, keep every connected sales channel synchronized, detect discrepancies, explain failures, and safely reconcile them.

The product is NOT primarily:

- an ERP
- accounting software
- a CRM
- a shipping company
- a warehouse ERP
- a generic AI chatbot
- a marketplace listing aggregator

Those may be future extensions.

The core system is:

```text
External Channels
        ↓
Normalized Events
        ↓
Internal Inventory Ledger
        ↓
Orders + Reservations
        ↓
Synchronization
        ↓
Verification
        ↓
Reconciliation
        ↓
Exception Management
```

---

## 2. PRODUCT PRINCIPLE

The fundamental product invariant is:

> **Inventory must be explainable.**

For every material inventory quantity, the system must be able to answer:

- What is the quantity?
- Where is it?
- When did it change?
- Why did it change?
- Which event caused it?
- Which user/system caused it?
- Which channels have received the change?
- Which channels have verified it?
- Is there a discrepancy?
- Can it be safely corrected?

No silent inventory mutation.

---

## 3. INITIAL ICP

Primary target:

- 100–5,000 ecommerce orders/month
- 2–5 sales channels
- 1–5 physical/virtual locations
- 100–50,000 SKUs
- meaningful overselling risk
- Shopify/Amazon/multichannel operations
- too complex for spreadsheets
- not yet requiring a heavyweight enterprise CommerceOps platform

Initial use cases:

1. Shopify + Amazon
2. Amazon + eBay
3. Shopify + Amazon + eBay
4. DTC brand expanding into marketplaces
5. Marketplace seller expanding into DTC
6. Multi-location ecommerce seller
7. Merchant migrating from legacy inventory software

---

## 4. IMPLEMENTATION STRATEGY

Do NOT attempt to launch all integrations simultaneously.

### Phase A — Production MVP

Implement:

- Shopify
- Amazon
- internal inventory ledger
- orders
- reservations
- synchronization
- verification
- reconciliation
- exception management
- billing
- audit
- monitoring

### Phase B

Add:

- eBay
- advanced purchasing
- additional warehouse capabilities
- CSV migration
- Ecomdash migration

### Phase C

Add:

- Walmart
- WooCommerce
- advanced automation
- AI assistant

The architecture MUST support all channels from the beginning, but only production-ready integrations should be enabled.

---

## 5. REQUIRED TECHNOLOGY STACK

Use the following stack unless a technical blocker requires a documented change.

### Frontend

- Next.js
- TypeScript
- React
- Tailwind CSS
- accessible component primitives
- TanStack Query for server state
- React Hook Form for forms
- Zod for validation

Use server rendering/static generation for public pages.

The authenticated application may use client-side interaction where appropriate.

### Backend

Use TypeScript throughout.

Recommended:

- Node.js
- NestJS or a similarly structured TypeScript backend framework
- REST API for application-facing APIs
- GraphQL ONLY where an external provider requires it, such as Shopify Admin GraphQL

Do not introduce multiple backend languages unless required by a future subsystem.

### Database

PostgreSQL.

Use:

- UUID primary identifiers
- foreign keys
- unique constraints
- database transactions
- explicit indexes
- optimistic/concurrency controls where necessary

### Queue

Use Redis + BullMQ or equivalent durable job queue.

All external synchronization and long-running work MUST be asynchronous.

### Cache

Redis.

Use caching only where consistency semantics are explicit.

Never use cache as the authoritative inventory store.

### Object storage

S3-compatible object storage.

Use for:

- imports
- exports
- reports
- generated files
- migration files

### Payments

Stripe Billing.

### Email

Transactional email provider with API support.

### Observability

OpenTelemetry-compatible tracing plus structured application logs and metrics.

### Deployment

Containerized deployment.

Minimum environments:

```text
development
staging
production
```

---

## 6. MONOREPO STRUCTURE

Use a monorepo.

Recommended:

```text
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
```

Do not duplicate domain logic between web, API and worker.

Domain logic belongs in shared server-side packages.

---

## 7. DOMAIN BOUNDARIES

The system MUST be divided into explicit domains:

```text
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
```

Do not allow arbitrary modules to directly mutate inventory.

All inventory mutations must pass through the inventory domain.

---

## 8. MULTI-TENANCY

Every business entity belongs to an organization.

Conceptual structure:

```text
Organization
 ├── Users
 ├── Roles
 ├── Channels
 ├── Warehouses
 ├── Products
 ├── SKUs
 ├── Inventory
 ├── Orders
 ├── Suppliers
 ├── Purchase Orders
 ├── Sync Jobs
 ├── Exceptions
 └── Audit Logs
```

Every tenant-scoped query MUST include organization context.

Never rely solely on frontend filtering.

Database/service-layer authorization must enforce tenancy.

---

## 9. IDENTIFIERS

Use UUIDs internally.

Every externally sourced object must additionally retain:

```text
provider
provider_account_id
provider_object_id
```

Example:

```text
internal_order_id
provider = amazon
provider_account_id = ...
provider_order_id = ...
```

Never use an external marketplace identifier as the internal primary key.

---

## 10. DATABASE SCHEMA

Implement the following core schema.

### organizations

```text
id UUID PK
name TEXT
slug TEXT UNIQUE
status ENUM
created_at TIMESTAMP
updated_at TIMESTAMP
```

### users

```text
id UUID PK
email TEXT UNIQUE
name TEXT
status ENUM
created_at TIMESTAMP
updated_at TIMESTAMP
```

### memberships

```text
id UUID PK
organization_id UUID FK
user_id UUID FK
role_id UUID FK
created_at TIMESTAMP

UNIQUE(organization_id, user_id)
```

### roles

```text
id UUID PK
organization_id UUID nullable
name TEXT
permissions JSONB
```

System roles:

```text
OWNER
ADMIN
MANAGER
OPERATOR
VIEWER
```

---

## 11. PRODUCTS

### products

```text
id UUID PK
organization_id UUID FK
title TEXT
description TEXT
brand TEXT
category TEXT
status ENUM
external_metadata JSONB
created_at
updated_at
```

### product_variants

```text
id UUID PK
organization_id UUID FK
product_id UUID FK
title TEXT
sku_id UUID FK
barcode TEXT
cost DECIMAL
price DECIMAL
weight DECIMAL
dimensions JSONB
status ENUM
created_at
updated_at
```

### skus

```text
id UUID PK
organization_id UUID FK
code TEXT
barcode TEXT
status ENUM
created_at
updated_at

UNIQUE(organization_id, code)
```

SKU uniqueness is tenant-scoped.

---

## 12. CHANNELS

### channels

```text
id UUID PK
provider ENUM
name TEXT
capabilities JSONB
created_at
```

Initial providers:

```text
SHOPIFY
AMAZON
EBAY
WALMART
```

### channel_accounts

```text
id UUID PK
organization_id UUID FK
channel_id UUID FK
display_name TEXT
status ENUM
external_account_id TEXT
credential_reference TEXT
metadata JSONB
last_successful_sync_at TIMESTAMP
last_error_at TIMESTAMP
created_at
updated_at
```

Credentials MUST NOT be stored directly in normal application tables.

Store encrypted secrets or references to a secrets-management system.

---

## 13. CHANNEL MAPPINGS

### channel_product_mappings

```text
id UUID PK
organization_id UUID FK
channel_account_id UUID FK
sku_id UUID FK
external_product_id TEXT
external_variant_id TEXT
external_sku TEXT
external_identifier JSONB
status ENUM
created_at
updated_at
```

Constraints:

A single external listing cannot accidentally map to multiple internal SKUs without an explicit supported relationship.

Flag:

- duplicate mappings
- orphaned mappings
- missing mappings
- stale mappings
- conflicting mappings

---

## 14. WAREHOUSES

### warehouses

```text
id UUID PK
organization_id UUID FK
name TEXT
type ENUM
address JSONB
status ENUM
created_at
updated_at
```

Types:

```text
WAREHOUSE
RETAIL
THIRD_PARTY_LOGISTICS
VIRTUAL
```

---

## 15. INVENTORY

### inventory_balances

One row per:

```text
organization + SKU + warehouse
```

Fields:

```text
id UUID PK
organization_id UUID FK
sku_id UUID FK
warehouse_id UUID FK

on_hand INTEGER
reserved INTEGER
allocated INTEGER
damaged INTEGER
quarantined INTEGER
in_transit INTEGER
incoming INTEGER
safety_stock INTEGER

version INTEGER

created_at
updated_at
```

Do not store `available` as an independently mutable value.

Calculate:

```text
available =
on_hand
- reserved
- safety_stock
- damaged
- quarantined
- allocated
```

where the allocation model requires it.

---

## 16. INVENTORY EVENTS

### inventory_events

```text
id UUID PK
organization_id UUID FK
sku_id UUID FK
warehouse_id UUID FK

event_type ENUM
quantity_delta INTEGER

source_type ENUM
source_id TEXT

order_id UUID nullable
reservation_id UUID nullable

before_state JSONB
after_state JSONB

idempotency_key TEXT
correlation_id UUID

actor_type ENUM
actor_id UUID nullable

created_at TIMESTAMP
```

Inventory event types:

```text
INITIAL_IMPORT
PURCHASE_RECEIPT
ORDER_RESERVATION
ORDER_RELEASE
ORDER_FULFILLMENT
ORDER_CANCELLATION
RETURN_RECEIPT
MANUAL_ADJUSTMENT
WAREHOUSE_TRANSFER
DAMAGE
RECOUNT
RECONCILIATION
SYSTEM_CORRECTION
```

---

## 17. RESERVATIONS

### inventory_reservations

```text
id UUID PK
organization_id UUID FK
sku_id UUID FK
warehouse_id UUID FK
order_id UUID FK

quantity INTEGER

status ENUM

created_at
released_at
fulfilled_at
```

Statuses:

```text
ACTIVE
RELEASED
FULFILLED
EXPIRED
```

Reservations must be transactionally safe.

Two simultaneous orders must never both reserve the same final unit.

---

## 18. ORDERS

### orders

```text
id UUID PK
organization_id UUID FK

channel_account_id UUID FK

external_order_id TEXT
order_number TEXT

status ENUM
payment_status ENUM
fulfillment_status ENUM

currency TEXT
subtotal DECIMAL
tax DECIMAL
shipping DECIMAL
discount DECIMAL
total DECIMAL

customer JSONB
shipping_address JSONB
billing_address JSONB

ordered_at TIMESTAMP
imported_at TIMESTAMP
updated_at TIMESTAMP
```

Unique:

```text
organization_id
channel_account_id
external_order_id
```

---

## 19. ORDER ITEMS

```text
id UUID PK
order_id UUID FK
sku_id UUID nullable

external_line_id TEXT

quantity INTEGER
unit_price DECIMAL
discount DECIMAL
tax DECIMAL

metadata JSONB
```

If a channel item cannot be mapped to a SKU, the order MUST enter an exception state rather than silently reducing unrelated inventory.

---

## 20. RETURNS

### returns

```text
id UUID PK
organization_id UUID FK
order_id UUID FK
external_return_id TEXT
status ENUM
reason TEXT
created_at
updated_at
```

Returns MUST NOT automatically increase sellable inventory until the business rule says the returned unit is sellable.

---

## 21. SUPPLIERS

### suppliers

```text
id UUID PK
organization_id UUID FK
name TEXT
email TEXT
phone TEXT
metadata JSONB
created_at
updated_at
```

---

## 22. PURCHASE ORDERS

### purchase_orders

```text
id UUID PK
organization_id UUID FK
supplier_id UUID FK

status ENUM

ordered_at
expected_at
received_at

currency
total

created_at
updated_at
```

Items:

```text
purchase_order_items
```

with:

```text
sku_id
ordered_quantity
received_quantity
unit_cost
```

---

## 23. SYNCHRONIZATION MODEL

Every outbound inventory update becomes a synchronization job.

### sync_jobs

```text
id UUID PK
organization_id UUID FK

channel_account_id UUID FK
sku_id UUID FK
warehouse_id UUID nullable

operation ENUM
target_quantity INTEGER

status ENUM

attempt_count INTEGER

idempotency_key TEXT
correlation_id UUID

queued_at
started_at
sent_at
acknowledged_at
verified_at
failed_at

last_error_code TEXT
last_error_message TEXT

created_at
updated_at
```

Operations:

```text
UPDATE_INVENTORY
CREATE_MAPPING
UPDATE_LISTING
```

---

## 24. SYNCHRONIZATION STATE MACHINE

Valid states:

```text
QUEUED
  ↓
PROCESSING
  ↓
SENT
  ↓
ACKNOWLEDGED
  ↓
VERIFYING
  ↓
VERIFIED
```

Failure transitions:

```text
PROCESSING → RETRYING
SENT → RETRYING
VERIFYING → RETRYING

RETRYING → PROCESSING

RETRY_LIMIT_REACHED → FAILED
PERMANENT_ERROR → REQUIRES_ACTION
CONFLICT → CONFLICT
```

A job MUST NOT be marked `VERIFIED` merely because the outbound API request returned HTTP success.

Where read-back verification is possible, perform it.

Where a provider's architecture does not permit immediate read-back, record the weaker verification state explicitly.

---

## 25. RETRY POLICY

Classify errors.

### TRANSIENT

Retry.

Examples:

- timeout
- temporary provider outage
- network failure

### RATE_LIMIT

Retry according to provider-provided delay.

### AUTHENTICATION

Do not blindly retry.

Create integration exception.

### VALIDATION

Do not retry unchanged request indefinitely.

Create exception.

### NOT_FOUND

Determine whether mapping became invalid.

### CONFLICT

Run reconciliation.

### UNKNOWN

Retry conservatively, then escalate.

Use exponential backoff with jitter.

Maximum attempts must be configurable by provider and operation.

---

## 26. IDEMPOTENCY

Every mutation that could be retried MUST have an idempotency key.

Example:

```text
orgId:channel:sku:inventoryVersion
```

Do not reuse an idempotency key for a materially different inventory state.

Incoming webhook/event processing must also be deduplicated.

---

## 27. CONCURRENCY CONTROL

Inventory updates must use transactional concurrency control.

Preferred approach:

```text
BEGIN
SELECT inventory row FOR UPDATE
validate available quantity
create reservation/event
update inventory
COMMIT
```

Alternatively use optimistic versioning with conflict detection.

Never perform:

```text
read quantity
wait
write quantity
```

without concurrency protection.

---

## 28. EVENT ORDERING

External events may arrive:

- late
- twice
- out of order
- after a manual adjustment

Every external event must carry:

- provider timestamp
- received timestamp
- provider event ID
- correlation ID

Do not assume arrival order equals event order.

---

## 29. RECONCILIATION

Create:

### reconciliation_runs

```text
id
organization_id
channel_account_id
started_at
completed_at
status
```

### reconciliation_results

```text
id
reconciliation_run_id
sku_id

internal_quantity
external_quantity

difference

classification
recommended_action

status

created_at
resolved_at
```

Classification:

```text
MATCH
MINOR_DIFFERENCE
MATERIAL_DIFFERENCE
MISSING_EXTERNAL
MISSING_INTERNAL
STALE_EXTERNAL
UNKNOWN
```

---

## 30. RECONCILIATION RULES

The system must not automatically assume that the external channel is wrong.

Possible sources of discrepancy:

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

The reconciliation engine should determine the most likely explanation using deterministic rules before AI analysis.

---

## 31. SAFE AUTO-RECONCILIATION

Automatic reconciliation requires:

1. known mapping
2. known source of truth
3. no unresolved competing event
4. permitted quantity delta
5. no active manual lock
6. no high-risk state

Otherwise:

```text
REQUIRES_APPROVAL
```

Example policy:

```text
difference <= configured_threshold
AND no conflicting event
AND trusted source
→ automatic correction
```

Otherwise:

```text
create exception
```

---

## 32. EXCEPTIONS

### exceptions

```text
id UUID PK
organization_id UUID FK

type ENUM
severity ENUM
status ENUM

entity_type
entity_id

title
description

root_cause JSONB
recommended_action JSONB

automatable BOOLEAN

created_at
updated_at
resolved_at

resolved_by UUID
```

Types:

```text
INVENTORY_MISMATCH
SYNC_FAILURE
AUTHENTICATION_FAILURE
MISSING_MAPPING
DUPLICATE_MAPPING
NEGATIVE_INVENTORY
ORDER_IMPORT_FAILURE
ORDER_UNMAPPED_SKU
RATE_LIMIT
PROVIDER_OUTAGE
STALE_DATA
```

Severity:

```text
CRITICAL
HIGH
MEDIUM
LOW
INFO
```

---

## 33. EXCEPTION LIFECYCLE

```text
OPEN
 ↓
INVESTIGATING
 ↓
ACTION_REQUIRED
 ↓
RESOLVING
 ↓
RESOLVED
```

Alternative:

```text
OPEN → IGNORED
```

Ignored exceptions must retain an audit record.

---

## 34. EXCEPTION UI

The exception must answer:

```text
WHAT HAPPENED?
WHY?
WHAT IS AFFECTED?
WHAT DID THE SYSTEM TRY?
WHAT HAPPENS NEXT?
WHAT CAN I DO?
```

Example:

```text
eBay inventory mismatch

SKU: ABC-123

Internal:
17

eBay:
15

Difference:
2

Last successful update:
11:42:09

Likely cause:
eBay did not acknowledge the previous inventory update.

Automatic resolution:
Available

[Reconcile Now]
```

---

## 35. PROVIDER ADAPTER CONTRACT

Every channel implementation MUST implement a common adapter interface.

Conceptual interface:

```typescript
interface ChannelAdapter {
  authenticate(): Promise<AuthResult>;

  refreshCredentials(): Promise<AuthResult>;

  getAccount(): Promise<ExternalAccount>;

  listProducts(cursor?: string): Promise<Page<ExternalProduct>>;

  getProduct(id: string): Promise<ExternalProduct>;

  listOrders(params: OrderQuery): Promise<Page<ExternalOrder>>;

  getOrder(id: string): Promise<ExternalOrder>;

  getInventory(input: InventoryQuery): Promise<ExternalInventory>;

  updateInventory(input: InventoryUpdate): Promise<UpdateResult>;

  registerWebhooks(): Promise<WebhookRegistrationResult>;

  verifyWebhook(request: WebhookRequest): Promise<boolean>;

  parseWebhook(request: WebhookRequest): Promise<NormalizedEvent>;

  healthCheck(): Promise<HealthStatus>;
}
```

Provider-specific features may extend this contract.

---

## 36. SHOPIFY ADAPTER

Use Shopify Admin GraphQL API.

Shopify's Admin API is versioned and should be configured to use a currently supported API version.

The adapter MUST support:

- OAuth installation
- secure token storage
- product import
- variant import
- inventory locations
- inventory retrieval
- inventory updates
- order ingestion
- webhook registration
- webhook validation
- uninstall handling
- rate-limit handling
- API version management

Use Shopify's versioned API endpoint.

Do not hard-code an obsolete API version.

Store the API version as configuration.

Required initial scopes MUST be the minimum required for implemented functionality.

---

## 37. SHOPIFY INVENTORY MODEL

Map:

```text
Shopify Product
→ Internal Product

Shopify Product Variant
→ Internal SKU

Shopify Location
→ Internal Warehouse

Shopify InventoryItem
→ Internal channel mapping
```

Do not treat Shopify's product ID and inventory item ID as interchangeable.

Maintain both.

---

## 38. AMAZON ADAPTER

Use Amazon Selling Partner API.

Use the currently supported Orders API version documented by Amazon and avoid deprecated API versions.

SP-API supports individual, batch and bulk operations, while notifications can deliver event updates.

The adapter MUST support:

- seller authorization
- token lifecycle
- marketplace selection
- order retrieval
- inventory/listing quantity retrieval
- inventory updates
- notification integration where available
- throttling
- retry
- error normalization

Do not implement against deprecated Orders API v0.

Use notifications where appropriate rather than relying exclusively on aggressive polling.

---

## 39. AMAZON INVENTORY SOURCE RULE

Do not treat FBA inventory and seller-fulfilled inventory as identical.

Represent fulfillment-channel context explicitly.

For initial MVP, prioritize seller-fulfilled inventory synchronization.

FBA support should be isolated as an explicit capability rather than accidentally mixed into the standard inventory ledger.

---

## 40. EBAY ADAPTER

eBay APIs use OAuth 2.0 with scopes controlling access.

Implement:

- authorization-code OAuth
- refresh-token lifecycle
- inventory API integration
- order retrieval
- fulfillment integration where required
- listing/product mapping
- inventory updates
- notifications where applicable
- sandbox support
- production support

Do not request unnecessary OAuth scopes.

Store refresh credentials securely.

---

## 41. WALMART ADAPTER

Implement after core MVP.

Walmart Marketplace APIs use OAuth 2.0.

Walmart's Inventory API supports inventory retrieval and updates by SKU and ship node, while its Orders APIs support retrieval, acknowledgement and fulfillment lifecycle operations.

The adapter must support:

- OAuth
- seller account
- ship nodes
- SKU mapping
- inventory retrieval
- inventory updates
- orders
- order acknowledgement
- webhook/event support where appropriate
- feed processing where appropriate
- rate limiting
- retries
- errors

Walmart supports asynchronous feeds for bulk inventory updates, so the adapter must model feed submission and feed-status verification separately from synchronous API operations.

---

## 42. PROVIDER HEALTH

Each integration must expose:

```text
CONNECTED
DEGRADED
AUTH_REQUIRED
RATE_LIMITED
ERROR
DISCONNECTED
```

Health metrics:

- last successful API call
- last successful inventory sync
- last webhook
- failed jobs
- pending jobs
- provider latency
- rate-limit state

---

## 43. WEBHOOK PROCESSING

Webhook endpoint:

```text
POST /webhooks/:provider/:accountId
```

Pipeline:

```text
Receive
 ↓
Authenticate/verify signature
 ↓
Persist raw event
 ↓
Deduplicate
 ↓
Acknowledge provider quickly
 ↓
Queue processing
 ↓
Normalize
 ↓
Apply domain event
 ↓
Trigger synchronization/reconciliation
```

Never perform long-running inventory operations before acknowledging a webhook when the provider expects a fast response.

Persist raw payloads securely with retention limits.

---

## 44. NORMALIZED EVENTS

Define:

```typescript
type NormalizedEvent =
  | OrderCreated
  | OrderUpdated
  | OrderCancelled
  | InventoryChanged
  | ProductChanged
  | ListingChanged
  | ReturnCreated
  | ReturnUpdated
  | IntegrationChanged;
```

Every event:

```text
event_id
provider
provider_account_id
provider_event_id
event_type
occurred_at
received_at
payload
correlation_id
```

---

## 45. API DESIGN

Base:

```text
/api/v1
```

Use REST for application APIs.

Every response should have predictable structure.

Success:

```json
{
  "data": {},
  "meta": {}
}
```

Error:

```json
{
  "error": {
    "code": "INVENTORY_CONFLICT",
    "message": "Inventory could not be reconciled.",
    "requestId": "..."
  }
}
```

Never return raw internal exceptions to users.

---

## 46. AUTH API

```text
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/refresh
POST /auth/forgot-password
POST /auth/reset-password
GET  /auth/me
```

Use secure sessions/tokens.

Do not store authentication secrets in localStorage where avoidable.

---

## 47. ORGANIZATION API

```text
GET    /organizations/current
PATCH  /organizations/current
GET    /organizations/current/members
POST   /organizations/current/members
PATCH  /organizations/current/members/:id
DELETE /organizations/current/members/:id
```

Authorization MUST be enforced server-side.

---

## 48. PRODUCT API

```text
GET    /products
POST   /products
GET    /products/:id
PATCH  /products/:id
DELETE /products/:id

GET    /products/:id/variants
POST   /products/:id/variants
PATCH  /variants/:id
```

Deletion should be soft deletion where historical references exist.

---

## 49. INVENTORY API

```text
GET /inventory
GET /inventory/:skuId
GET /inventory/:skuId/timeline

POST /inventory/adjustments
POST /inventory/reconcile

GET /inventory/conflicts
```

Manual adjustments require:

```text
sku
warehouse
quantity
reason
```

Large adjustments may require elevated permission.

---

## 50. ORDER API

```text
GET /orders
GET /orders/:id
POST /orders/:id/cancel
GET /orders/:id/events
GET /orders/:id/reservations
```

Provider-specific order mutation should occur through the integration service.

---

## 51. INTEGRATION API

```text
GET  /integrations
GET  /integrations/:id
POST /integrations/:provider/connect
GET  /integrations/:provider/callback
POST /integrations/:id/sync
POST /integrations/:id/reconnect
POST /integrations/:id/disconnect
GET  /integrations/:id/health
```

OAuth callbacks must validate state and tenant context.

---

## 52. EXCEPTION API

```text
GET   /exceptions
GET   /exceptions/:id
POST  /exceptions/:id/resolve
POST  /exceptions/:id/retry
POST  /exceptions/:id/ignore
POST  /exceptions/:id/reconcile
```

All mutations create audit records.

---

## 53. RECONCILIATION API

```text
POST /reconciliation/run
GET  /reconciliation/runs
GET  /reconciliation/runs/:id
GET  /reconciliation/results/:id
POST /reconciliation/results/:id/approve
POST /reconciliation/results/:id/reject
```

---

## 54. API SECURITY

Implement:

- authentication
- authorization
- RBAC
- tenant enforcement
- request validation
- rate limiting
- CSRF protection where applicable
- secure headers
- audit logging
- request IDs
- input size limits
- pagination limits

All external IDs must be validated.

---

## 55. FRONTEND ARCHITECTURE

Use:

```text
app/
  (marketing)/
  (auth)/
  (dashboard)/
```

Authenticated layout:

```text
Sidebar
Topbar
Breadcrumb
Page content
Notifications
```

Use reusable components:

```text
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
```

Do not create one-off versions of common components.

---

## 56. MAIN APPLICATION NAVIGATION

```text
Overview

Inventory
Orders
Products
Warehouses
Purchasing

Exceptions

Integrations

Reports

AI Assistant

Settings
Billing
```

---

## 57. OVERVIEW

The overview page must prioritize operational health.

Sections:

```text
Inventory Health
Critical Exceptions
Synchronization Health
Low Stock
Recent Inventory Events
Channel Health
```

Avoid dashboard clutter.

---

## 58. INVENTORY SCREEN

Table:

```text
SKU
Product
Warehouse
On Hand
Reserved
Available
Amazon
Shopify
eBay
Walmart
Status
```

Filters:

- channel
- warehouse
- low stock
- mismatch
- sync state
- product
- SKU

Support server-side pagination and filtering.

---

## 59. SKU DETAIL

Sections:

```text
Summary
Inventory by Warehouse
Inventory by Channel
Synchronization
Exceptions
Timeline
Orders
Audit
```

The timeline is critical.

---

## 60. INTEGRATION SCREEN

Each connected integration:

```text
Provider
Account
Status
Last sync
Last error
Pending jobs
Failed jobs
Webhook health

[Sync Now]
[Reconnect]
[Disconnect]
```

---

## 61. EXCEPTION INBOX

Default dashboard priority.

Filters:

```text
Critical
High
Medium
Low
Resolved
Open
Inventory
Orders
Integrations
```

Sorting:

```text
severity
age
impact
```

Do not sort merely by creation time.

---

## 62. ONBOARDING

Flow:

```text
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
```

Do not enable destructive outbound synchronization before initial inventory validation.

---

## 63. INITIAL SYNC SAFETY

This is mandatory.

When a merchant connects a channel:

```text
IMPORT
 ↓
COMPARE
 ↓
SHOW DIFFERENCES
 ↓
USER CONFIRMS SOURCE OF TRUTH
 ↓
ENABLE OUTBOUND SYNC
```

Do not immediately overwrite marketplace inventory merely because the integration was connected.

This prevents catastrophic initial synchronization.

---

## 64. SOURCE-OF-TRUTH MODEL

For each organization/channel/warehouse configuration, allow explicit rules.

Example:

```text
Internal inventory = authoritative
```

or:

```text
External quantity = observed state only
```

The system should never infer authority from whichever value happens to be newest.

---

## 65. INVENTORY ALLOCATION

Support channel allocations.

Example:

```text
Available: 100

Amazon: 40
Shopify: 30
eBay: 20
Reserve: 10
```

Allocation policies:

```text
PROPORTIONAL
FIXED
PRIORITY
UNALLOCATED
```

V1 can use fixed/priority allocation.

---

## 66. NEGATIVE INVENTORY

Negative inventory is allowed internally only as an explicit exceptional state.

If:

```text
available < 0
```

create:

```text
NEGATIVE_INVENTORY
```

Do not silently clamp it to zero.

Clamping hides data integrity failures.

---

## 67. MANUAL ADJUSTMENT

Every manual adjustment requires:

```text
quantity
reason
warehouse
SKU
actor
timestamp
```

Optional reason categories:

```text
RECOUNT
DAMAGE
THEFT
FOUND_STOCK
DATA_CORRECTION
OPENING_BALANCE
OTHER
```

---

## 68. AUDIT SYSTEM

### audit_logs

```text
id
organization_id
actor_type
actor_id
action
entity_type
entity_id
before_state
after_state
reason
request_id
correlation_id
created_at
```

Audit logs are append-only.

Do not provide ordinary users a mechanism to edit audit history.

---

## 69. SECURITY

Minimum:

- TLS
- encrypted secrets
- encrypted sensitive data
- OAuth state validation
- webhook signature validation
- RBAC
- tenant isolation
- password hashing
- session expiration
- refresh-token rotation where appropriate
- brute-force protection
- rate limiting
- security headers
- dependency scanning
- secret scanning

Marketplace credentials MUST never appear in frontend payloads.

---

## 70. DATA RETENTION

Define configurable retention.

Keep:

- inventory events
- audit logs
- synchronization records
- reconciliation results

for a commercially reasonable period.

Raw webhook payloads should have shorter retention unless required for support/audit.

Implement deletion/anonymization workflows where legally required.

---

## 71. PRIVACY

Public privacy documentation must accurately state:

- data collected
- marketplace data accessed
- purpose
- storage
- retention
- deletion
- subprocessors
- customer rights

Do not claim certifications or compliance that have not been obtained.

---

## 72. BILLING

Use Stripe Billing.

Plans:

```text
STARTER
GROWTH
SCALE
ENTERPRISE
```

Recommended initial prices:

```text
Starter   $29/month
Growth    $79/month
Scale     $199/month
Enterprise custom
```

These are product strategy values, not claims about competitor pricing.

Entitlements must be stored internally.

Example:

```text
plan = GROWTH

max_orders = 2500
max_channels = 10
max_warehouses = 10
max_users = 10
```

Never hard-code entitlement logic into frontend components.

---

## 73. BILLING EVENTS

Handle provider billing events asynchronously.

At minimum support:

```text
subscription created
subscription updated
subscription canceled
invoice paid
invoice payment failed
checkout completed
```

Billing state must be synchronized from verified billing-provider events.

Do not trust frontend success redirects as proof of payment.

---

## 74. USAGE METERING

Track:

```text
monthly orders
channels
warehouses
users
API calls
automation executions
storage
```

Use usage records.

Do not calculate usage only from current UI tables.

---

## 75. PLAN ENFORCEMENT

Three levels:

```text
INFO
WARNING
HARD_LIMIT
```

Never abruptly disable critical inventory synchronization because a merchant crossed a soft usage threshold.

If a hard limit affects functionality, make the behavior explicit and safe.

---

## 76. NOTIFICATIONS

Channels:

V1:

- in-app
- email

Notification categories:

```text
Critical inventory conflict
Integration authentication
Repeated sync failure
Low stock
Negative inventory
Reconciliation required
Billing
```

Do not notify users for every successful background operation.

---

## 77. AI ASSISTANT

AI is a secondary interface over deterministic system data.

Allowed:

```text
Explain
Search
Summarize
Diagnose
Recommend
Prepare action
```

AI must not become the source of truth.

Example:

> Why is SKU ABC-123 different on eBay?

The AI should query:

- inventory state
- sync jobs
- webhook events
- order events
- reconciliation history

Then produce a concise explanation.

---

## 78. AI ACTION MODEL

AI action:

```text
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
```

AI cannot directly execute arbitrary SQL or provider API calls.

---

## 79. AI HALLUCINATION CONTROL

AI responses must distinguish:

```text
Observed fact
Inference
Recommendation
Unknown
```

Example:

> **Observed:** eBay currently reports 15 units.

> **Observed:** The last outbound update attempted to set 17 units.

> **Likely cause:** The update was not acknowledged.

> **Recommendation:** Retry reconciliation.

Do not state the likely cause as established fact.

---

## 80. REPORTING

V1 reports:

- inventory value
- inventory by warehouse
- inventory by channel
- low stock
- stockouts
- synchronization health
- discrepancy history
- order volume

Reports must be derived from transactional data.

---

## 81. EXPORTS

Users can export:

```text
Products
SKUs
Inventory
Orders
Exceptions
Reconciliation
Audit logs
```

Formats:

- CSV
- XLSX where useful

Large exports must run asynchronously.

---

## 82. MIGRATION

V1:

- CSV import
- generic inventory import

V2:

- Ecomdash migration
- Sellbrite migration
- Veeqo migration
- Zoho migration

Migration pipeline:

```text
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
```

Never silently discard unmapped records.

---

## 83. SEO/GEO ARCHITECTURE

The public website MUST be architecturally separated from the authenticated app.

Public pages:

```text
/
/pricing
/integrations
/compare/*
/alternatives/*
/solutions/*
/guides/*
/tools/*
/docs/*
```

Application:

```text
/app/*
```

Application pages should normally be `noindex`.

---

## 84. SEO TECHNICAL REQUIREMENTS

Implement:

- SSR/SSG
- canonical URLs
- XML sitemap
- robots.txt
- metadata
- Open Graph
- Twitter/X metadata where useful
- semantic HTML
- breadcrumbs
- structured data where valid
- internal linking
- fast page load
- image optimization
- pagination handling
- 404 handling
- redirects
- hreflang only if genuinely supporting multiple locales

Do not generate thousands of low-value programmatic pages.

---

## 85. SEO PAGE TYPES

Competitors:

```text
/ecomdash-alternative
/veeqo-alternative
/sellbrite-alternative
/zoho-inventory-alternative
/linnworks-alternative
```

Problems:

```text
/multichannel-inventory-management
/inventory-reconciliation
/inventory-synchronization
/prevent-ecommerce-overselling
/amazon-shopify-inventory-sync
/shopify-ebay-inventory-sync
```

Industries:

```text
/inventory-software-for-apparel
/inventory-software-for-electronics
/inventory-software-for-wholesalers
```

Tools:

```text
/inventory-turnover-calculator
/reorder-point-calculator
/safety-stock-calculator
/eoq-calculator
```

Every page must provide unique useful information.

---

## 86. GEO

Structure important pages so automated systems can extract factual answers.

Use explicit sections:

```text
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
```

Do not fabricate testimonials, statistics or customer claims.

---

## 87. PUBLIC DOCUMENTATION

Documentation:

```text
/docs/getting-started
/docs/inventory
/docs/orders
/docs/integrations
/docs/reconciliation
/docs/api
/docs/security
/docs/billing
```

Documentation should be publicly crawlable unless it contains sensitive information.

---

## 88. STATUS PAGE

Expose operational status:

```text
Application
API
Shopify
Amazon
eBay
Walmart
Synchronization
```

Status must be generated from actual monitoring.

---

## 89. OBSERVABILITY

Every request gets:

```text
request_id
```

Every asynchronous operation gets:

```text
job_id
correlation_id
```

Every external provider call records:

```text
provider
operation
latency
status
error_class
correlation_id
```

Do not log:

- access tokens
- refresh tokens
- passwords
- payment secrets
- full sensitive customer data

---

## 90. METRICS

Track:

```text
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
```

---

## 91. ALERTING

Alert engineering when:

- synchronization failure exceeds threshold
- queue backlog exceeds threshold
- webhook processing fails
- provider error rate spikes
- database errors spike
- reconciliation failures spike
- authentication failures increase abnormally

Thresholds must be configurable.

---

## 92. BACKUP

Production database:

- automated backups
- point-in-time recovery where supported
- backup verification
- documented restore procedure

Do not claim disaster recovery readiness without testing restoration.

---

## 93. CI/CD

Every pull request must run:

```text
typecheck
lint
unit tests
integration tests
build
security checks
```

Main branch:

```text
build
test
deploy staging
smoke test
```

Production:

```text
approved release
deploy
health check
rollback capability
```

---

## 94. TESTING PYRAMID

### Unit

Test:

- inventory calculations
- reservation logic
- allocation
- reconciliation
- state transitions
- error classification

### Integration

Test:

- database
- queue
- provider adapters
- webhook processing
- billing webhooks

### End-to-end

Test:

```text
signup
connect channel
import product
map SKU
import order
reserve inventory
sync inventory
verify
create mismatch
reconcile
resolve exception
```

---

## 95. CRITICAL INVENTORY TESTS

### Concurrent order

Two orders attempt to reserve one remaining unit.

Expected:

```text
One succeeds.
One fails/resolves according to configured behavior.
Inventory never becomes incorrectly oversold because of a race.
```

### Duplicate webhook

Same event arrives twice.

Expected:

```text
Single logical inventory mutation.
```

### Out-of-order event

Cancellation arrives after an older order state.

Expected:

```text
Event ordering logic prevents corruption.
```

### Sync retry

Provider request times out after provider accepted it.

Expected:

```text
Retry is idempotent.
No duplicate inventory mutation.
```

### External discrepancy

Provider quantity differs.

Expected:

```text
Conflict detected.
Exception created.
```

---

## 96. PROVIDER TESTING

Every provider adapter requires:

```text
authentication test
catalog import test
inventory read test
inventory write test
order import test
webhook test
rate-limit test
timeout test
authentication failure test
duplicate event test
reconciliation test
```

Provider sandbox must be used wherever available.

Production credentials must never be committed to source control.

---

## 97. MOCK PROVIDER

Create an internal deterministic fake marketplace adapter.

It must simulate:

```text
successful sync
timeout
rate limit
auth failure
duplicate webhook
delayed webhook
wrong quantity
provider outage
```

This is required for repeatable synchronization tests.

The mock provider MUST be clearly separated from production providers.

---

## 98. FRONTEND ACCEPTANCE

Every production page must support:

```text
loading
empty
success
error
partial failure
permission denied
```

Tables must support:

- pagination
- sorting
- filtering
- search
- responsive behavior

Forms must show actionable validation errors.

---

## 99. ACCESSIBILITY

Target WCAG 2.2 AA.

Required:

- keyboard navigation
- focus states
- labels
- semantic elements
- accessible tables
- accessible dialogs
- accessible alerts
- sufficient contrast
- screen-reader-compatible controls

---

## 100. DESIGN SYSTEM

Visual direction:

```text
Professional
Technical
Trustworthy
Operational
Minimal
Fast
```

Avoid:

- excessive gradients
- meaningless animations
- excessive glassmorphism
- decorative charts
- visual clutter
- giant marketing animations

The dashboard must feel like mission-control software.

---

## 101. APPLICATION PERFORMANCE

Targets:

- fast initial render
- minimal client JavaScript
- lazy-loaded heavy components
- server-side data fetching where appropriate
- indexed database queries
- cursor pagination for large datasets
- background processing for expensive operations

Never load an entire organization's order history into the browser.

---

## 102. DATABASE INDEXING

At minimum index:

```text
organization_id
organization_id + sku_id
organization_id + warehouse_id
organization_id + channel_account_id
organization_id + status
organization_id + created_at
external IDs
idempotency keys
correlation IDs
```

Analyze actual production query plans before adding excessive indexes.

---

## 103. PAGINATION

Use cursor pagination for large datasets.

Default:

```text
page size = 50
```

Maximum:

```text
page size = 250
```

Never allow arbitrary unlimited queries.

---

## 104. RATE LIMITING

Application APIs:

```text
authentication endpoints
public endpoints
user APIs
admin APIs
webhooks
```

must have appropriate rate limits.

Provider-specific rate limits belong inside provider adapters.

---

## 105. FEATURE FLAGS

Use feature flags for:

- new integrations
- AI
- automatic reconciliation
- new allocation algorithms
- migration tools

Flags must be organization-aware.

---

## 106. ADMIN CONSOLE

Internal admin:

```text
Organizations
Users
Subscriptions
Integrations
Sync Jobs
Exceptions
System Health
Feature Flags
Audit
```

Admin actions:

- require authorization
- are logged
- cannot bypass audit requirements

---

## 107. SUPPORT TOOLING

Support staff should be able to inspect:

```text
Organization
Integration health
Recent jobs
Recent exceptions
SKU history
Inventory events
Audit history
```

Do not expose marketplace secrets.

---

## 108. CUSTOMER DATA EXPORT

Provide organization-level export.

Export must include:

```text
products
SKUs
inventory
orders
exceptions
audit data
integration mappings
```

Do not make customer data intentionally inaccessible.

---

## 109. ACCOUNT DELETION

Deletion must use an explicit workflow.

Before deletion:

```text
warn user
confirm
export option
```

Then:

```text
disable integrations
stop background jobs
revoke credentials where possible
delete/anonymize data according to retention policy
record deletion event
```

Do not leave active marketplace credentials after account deletion.

---

## 110. INITIAL DASHBOARD ACCEPTANCE TEST

After connecting Shopify + Amazon and importing inventory, a user must be able to see:

```text
Total SKUs
Total on-hand inventory
Reserved inventory
Available inventory

Shopify health
Amazon health

Open exceptions
Synchronization status
```

---

## 111. INITIAL SYNC ACCEPTANCE TEST

Given:

```text
Internal = 20
Shopify = 20
Amazon = 18
```

The application must NOT silently overwrite Amazon.

It must show:

```text
Inventory discrepancy detected.

Internal: 20
Amazon: 18

[Investigate]
```

If the user explicitly authorizes correction:

```text
submit update
verify
record event
mark resolved
```

---

## 112. FAILURE ACCEPTANCE TEST

If Amazon rejects an inventory update:

The UI must eventually show:

```text
Amazon inventory update failed.

Reason:
<normalized provider error>

Automatic retry:
<status>

Attempts:
<n>

Affected SKU:
ABC-123

[Retry]
```

Never show a green success state.

---

## 113. VERIFICATION ACCEPTANCE TEST

Given:

```text
internal = 17
```

System sends:

```text
Amazon = 17
```

Provider acknowledges.

If read-back returns:

```text
Amazon = 15
```

the job MUST become:

```text
CONFLICT
```

not:

```text
VERIFIED
```

---

## 114. AUDIT ACCEPTANCE TEST

For every inventory change, a support administrator must be able to reconstruct:

```text
before
event
actor
reason
after
channel impact
synchronization result
```

---

## 115. TENANT ISOLATION ACCEPTANCE TEST

Create:

```text
Organization A
Organization B
```

Attempt:

```text
A → B product
A → B inventory
A → B order
A → B exception
A → B integration
```

Every attempt must fail authorization.

---

## 116. BILLING ACCEPTANCE TEST

Test:

```text
new subscription
payment success
payment failure
upgrade
downgrade
cancellation
reactivation
usage threshold
```

Frontend must never independently determine billing status.

---

## 117. SEO ACCEPTANCE TEST

For every public page:

- valid title
- valid description
- canonical
- crawlable HTML
- internal links
- correct status code
- sitemap inclusion where appropriate
- structured data only when applicable
- no accidental `noindex`

Authenticated application routes must not compete with public pages in search.

---

## 118. SECURITY ACCEPTANCE TEST

Test:

```text
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
```

Run dependency/security scanning in CI.

---

## 119. NO MOCK COMPLETION RULE

Anti Gravity MUST NOT say:

> “Amazon integration complete”

if the implementation only contains:

- UI
- mock data
- placeholder API
- fake synchronization
- simulated success

A feature is complete only when its implementation and acceptance tests pass.

---

## 120. NO SILENT FALLBACK

If an external API is unavailable:

Do NOT silently switch to fake data.

Display:

```text
Provider unavailable.
Last verified state:
<timestamp>
```

Maintain the last known state with explicit freshness information.

---

## 121. FRESHNESS

Every external quantity should have:

```text
observed_at
received_at
verified_at
```

The UI should be able to display:

> Last verified 42 seconds ago.

Never present stale external information as current.

---

## 122. PRODUCT TRUST MODEL

The UI must distinguish:

```text
LIVE
VERIFIED
STALE
CONFLICT
UNKNOWN
```

Do not use green checks for data that has merely been requested.

---

## 123. RELEASE STRATEGY

Do not release all functionality simultaneously.

Release:

```text
Private alpha
 ↓
5–10 merchants
 ↓
observe real synchronization
 ↓
fix integrity failures
 ↓
paid beta
 ↓
public launch
```

The first customers should be treated as operational validation, not merely acquisition.

---

## 124. LAUNCH CRITERIA

Do not publicly market the platform as production-ready until:

- Shopify integration passes
- Amazon integration passes
- synchronization reliability is measured
- reconciliation works
- tenant isolation passes
- billing works
- backups work
- monitoring works
- critical test suite passes
- failure states are implemented
- support tooling exists

---

## 125. CORE NORTH-STAR METRIC

Primary:

> **Verified inventory accuracy across connected channels.**

Secondary:

```text
Synchronization verification rate
Inventory conflicts / 1,000 SKUs
Median synchronization latency
Automatic resolution rate
Mean time to resolve exceptions
Oversell incidents
Failed synchronization rate
```

Do not optimize for number of integrations as the primary metric.

---

## 126. MVP PRODUCT SURFACE

Production MVP navigation:

```text
Overview
Inventory
Orders
Products
Exceptions
Integrations
Settings
Billing
```

Do not expose unfinished:

```text
AI Assistant
Advanced Reports
Purchasing
Walmart
Advanced Warehouse
```

as production features.

They may exist behind feature flags.

---

## 127. V1 PRODUCT SURFACE

After MVP validation:

```text
Overview
Inventory
Orders
Products
Warehouses
Purchasing
Exceptions
Integrations
Reports
AI Assistant
Settings
Billing
```

---

## 128. PUBLIC WEBSITE

Navigation:

```text
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
```

Hero:

> **Inventory you can trust across every sales channel.**

Subheadline:

> One source of truth for ecommerce inventory, with verified synchronization, discrepancy detection and automated reconciliation.

Primary CTA:

> Start Free

Secondary CTA:

> See How It Works

---

## 129. COMPETITOR PAGES

Build factual pages:

```text
Ecomdash alternative
Veeqo alternative
Sellbrite alternative
Zoho Inventory alternative
Linnworks alternative
```

Each page MUST clearly distinguish:

```text
documented fact
our feature
third-party claim
unknown
```

Never fabricate competitor deficiencies.

---

## 130. MIGRATION POSITIONING

Create:

> Migrate from Ecomdash without rebuilding your inventory operation from scratch.

Later:

> Migrate from Veeqo.

> Migrate from Sellbrite.

> Migrate from Zoho Inventory.

Migration pages must describe exactly what can and cannot be migrated.

---

## 131. PRODUCT ANALYTICS

Track:

```text
signup
organization_created
integration_started
integration_connected
catalog_import_started
catalog_import_completed
sku_mapping_started
sku_mapping_completed
first_sync
first_verified_sync
first_exception
first_reconciliation
first_payment
```

Do not collect unnecessary personal information.

---

## 132. ERROR TRACKING

Every production error should include:

```text
request_id
organization_id
user_id if applicable
provider
operation
environment
version
stack trace internally
```

Sensitive information must be scrubbed.

---

## 133. DOCUMENTATION REQUIRED BEFORE RELEASE

Create:

```text
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
```

---

## 134. ENGINEERING RUNBOOKS

Create runbooks for:

```text
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
```

---

## 135. INCIDENT RESPONSE

For critical inventory incidents:

```text
Detect
 ↓
Contain
 ↓
Determine affected tenants
 ↓
Stop dangerous automation if necessary
 ↓
Preserve event history
 ↓
Correct
 ↓
Verify
 ↓
Communicate
 ↓
Postmortem
```

Never erase evidence to make dashboards appear healthy.

---

## 136. DANGEROUS OPERATIONS

Require explicit confirmation for:

- bulk inventory adjustment
- bulk SKU remapping
- bulk deletion
- disconnecting channel
- mass reconciliation
- large inventory correction

Display impact before execution.

Example:

> This action will update 1,284 SKUs across Amazon.

---

## 137. MASS ACTIONS

All mass actions must:

- show scope
- show affected count
- require confirmation
- create audit record
- run asynchronously
- be cancellable where feasible
- report partial failures

---

## 138. PARTIAL FAILURE

Example:

```text
1,000 inventory updates
982 successful
12 retrying
6 failed
```

The system MUST NOT label the entire operation simply:

> Successful.

Show exact state.

---

## 139. DATA CONSISTENCY

Transactional database operations must be used for:

```text
order reservation
inventory mutation
reservation release
inventory adjustment
reconciliation mutation
```

Do not split one logical inventory mutation into multiple non-transactional writes.

---

## 140. EVENTUAL CONSISTENCY

External marketplaces are inherently eventually consistent.

The UI must communicate this.

Example:

> Update submitted. Verification pending.

Not:

> Inventory synchronized.

until verified.

---

## 141. PERFORMANCE BOUNDARIES

Do not block the user request while:

- importing thousands of products
- syncing thousands of SKUs
- running reconciliation
- exporting reports
- processing large migrations

Create background jobs.

---

## 142. JOB STATES

All asynchronous jobs:

```text
QUEUED
RUNNING
SUCCEEDED
PARTIAL
RETRYING
FAILED
CANCELLED
```

Store job progress.

---

## 143. JOB OBSERVABILITY

Every job should expose:

```text
job ID
type
started
duration
progress
attempts
current state
errors
```

Admin can inspect failures.

---

## 144. RATE LIMIT MANAGEMENT

Provider adapters must have independent rate-limit managers.

When a provider reports throttling:

```text
pause appropriate queue
respect retry-after
resume
```

Do not allow one tenant's synchronization storm to starve all other tenants.

---

## 145. FAIR QUEUING

Queue architecture should support tenant-aware scheduling.

One large merchant must not monopolize workers.

Use:

```text
tenant priority
provider priority
job priority
rate-limit bucket
```

---

## 146. SCALE ARCHITECTURE

Initial architecture should support:

```text
multiple API instances
multiple worker instances
multiple queue workers
read replicas later
```

Do not assume a single server.

---

## 147. CACHE RULE

Never cache inventory in a way that can become the apparent authoritative source.

Cache:

- product metadata
- integration metadata
- dashboard aggregates

with explicit TTL/invalidation.

Inventory truth remains database-backed.

---

## 148. SEARCH

Use PostgreSQL search initially.

Search:

- SKU
- product title
- barcode
- order number
- external ID

Do not introduce Elasticsearch/OpenSearch until scale requires it.

---

## 149. NOTIFICATION DEDUPLICATION

Repeated identical failures should not generate hundreds of emails.

Group repeated incidents.

Example:

> Amazon inventory synchronization has failed for 14 SKUs over the last 20 minutes.

rather than 14 separate messages.

---

## 150. FINAL DEFINITION OF DONE

The MVP is complete ONLY when all of the following are true:

### Product

- organization creation works
- authentication works
- billing works
- product catalog works
- SKU mapping works

### Inventory

- inventory ledger works
- reservations work
- concurrency is safe
- manual adjustments work
- audit trail works

### Shopify

- OAuth works
- catalog import works
- inventory read works
- inventory write works
- webhook processing works
- verification works

### Amazon

- authorization works
- order import works
- inventory workflow works
- throttling works
- notifications/polling strategy works
- verification/reconciliation works

### Synchronization

- queue works
- retry works
- idempotency works
- failure classification works
- partial failure works
- verification works

### Reconciliation

- discrepancy detection works
- exception creation works
- manual resolution works
- safe automatic resolution works where configured
- audit works

### Security

- tenant isolation tested
- RBAC tested
- OAuth security tested
- webhook security tested
- secrets protected

### Operations

- logging works
- monitoring works
- alerting works
- backups work
- restoration has been tested
- rollback exists

### Web

- public site works
- SEO architecture works
- documentation works
- pricing works
- legal pages exist
- app routes are appropriately protected/noindexed

### Testing

Critical inventory paths have automated tests.

No production-critical functionality is simulated.

---

## 151. IMPLEMENTATION ORDER

Anti Gravity MUST implement in this order:

```text
1. Repository
2. Infrastructure
3. Database
4. Authentication
5. Organizations / RBAC
6. Domain models
7. Inventory ledger
8. Reservations
9. Orders
10. Job system
11. Synchronization framework
12. Shopify adapter
13. Shopify verification
14. Amazon adapter
15. Amazon verification
16. Reconciliation
17. Exception inbox
18. Audit system
19. Billing
20. Notifications
21. Dashboard
22. Product/inventory UI
23. Integration UI
24. Testing
25. Observability
26. Security hardening
27. Public website
28. SEO/GEO
29. Migration
30. Production deployment
```

Do not reverse this order merely because UI work is visually easier.

---

## 152. ANTI GRAVITY OPERATING RULE

Before implementing each subsystem:

1. Read the relevant section of this specification.
2. Identify dependencies.
3. Implement the domain model.
4. Implement server behavior.
5. Implement tests.
6. Implement UI.
7. Run validation.
8. Only then mark the feature complete.

Do not build screens first and retrofit the backend.

---

## 153. FINAL ARCHITECTURAL PRINCIPLE

The entire platform should reduce to:

```text
                EXTERNAL WORLD

 Shopify ─────┐
 Amazon ──────┤
 eBay ────────┤
 Walmart ────┘
       │
       ▼
┌───────────────────────────┐
│     PROVIDER ADAPTERS     │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│      EVENT NORMALIZER     │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│    INTERNAL INVENTORY     │
│          LEDGER           │
└─────────────┬─────────────┘
              │
      ┌───────┼────────┐
      ▼       ▼        ▼
   Orders Reservations Allocation
      │       │        │
      └───────┼────────┘
              ▼
┌───────────────────────────┐
│    SYNC ORCHESTRATOR      │
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│     VERIFICATION          │
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│     RECONCILIATION        │
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│    EXCEPTION ENGINE       │
└─────────────┬─────────────┘
              ▼
       MERCHANT ACTION
```

The product's technical identity is therefore:

> **A transactional inventory-control and synchronization system with reconciliation intelligence.**

Not:

> “A dashboard that connects ecommerce stores.”

That distinction must remain intact throughout implementation.

# END OF CANONICAL ENGINEERING SPECIFICATION V2
