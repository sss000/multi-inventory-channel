# Webhook Ingestion, Raw Storage & Event Normalization Architecture

## 1. System Overview

This document specifies the technical architecture, invariants, and implementation of **Phase 17: Webhook and Event Normalization** (Prompt 18) for the Multichannel Inventory Control Platform conforming to Sections 43 & 44 of `01_ENGINEERING_SPEC.md` and `specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md`.

The webhook subsystem provides a reliable, secure, high-throughput ingestion and event normalization gateway for external e-commerce channel events (Shopify, Amazon, Walmart, eBay).

```
+---------------------------------------------------------------------------------------------------------+
|                                    CANONICAL INBOUND WEBHOOK PIPELINE                                   |
|                                                                                                         |
|  [ Inbound HTTP Request ] -> POST /webhooks/:provider/:accountId                                        |
|             |                                                                                           |
|             v                                                                                           |
|  [ 1. Receive & Size Check ]  ---(> 5MB?)---------------------------------> [ HTTP 413 Payload Too Large ]|
|             |                                                                                           |
|             v                                                                                           |
|  [ 2. Verify Signature ]     ---(Invalid Sig?)----------------------------> [ HTTP 401 Unauthorized ]  |
|             |                                                                                           |
|             v                                                                                           |
|  [ 3. Persist Raw Event ]    --> Supabase Storage: ${orgId}/webhooks/${year}/${month}/${eventId}.json   |
|             |                   (Access controls, 30d retention, PII / PAN / token redaction)           |
|             v                                                                                           |
|  [ 4. Deduplicate ]          ---(Already Seen?)---------------------------> [ Return Cached HTTP 200 ]  |
|             |                                                                                           |
|             v                                                                                           |
|  [ 5. Fast Acknowledgement ] --> Return HTTP 200/202 to External Provider (< 50ms)                      |
|             |                                                                                           |
|   INVARIANT: LONG-RUNNING WORK NEVER OCCURS BEFORE ACKNOWLEDGEMENT!                                     |
|             |                                                                                           |
|             v                                                                                           |
|  [ 6. Queue Processing ]     --> Enqueue background job to FairShareQueue (Priority 8)                  |
|             |                                                                                           |
|             v                                                                                           |
|  [ 7. Normalize Event ]      --> Maps to 1 of 9 Canonical Normalized Events                             |
|             |                   (Malformed JSON / missing fields -> DLQ / HTTP 400 Bad Request)         |
|             v                                                                                           |
|  [ 8. Apply Domain Event ]   --> Order / Reservation / Inventory Ledger / Catalog Dispatches           |
|             |                   * Out-of-order protection (drops stale older events T1 < T2)            |
|             |                   * Delayed event protection (> 24h lag flags reconciliation)             |
|             v                                                                                           |
|  [ 9. Trigger Sync / Recon ] --> Outbound channel broadcast via SyncEngine / Discrepancy reconciliation  |
+---------------------------------------------------------------------------------------------------------+
```

---

## 2. Invariants & Mandatory Rules

### Invariant 1: Fast Acknowledgement Before Long-Running Work
External channels (e.g. Shopify, Amazon EventBridge/SNS) expect rapid HTTP 200/202 acknowledgements (often < 500ms). If an inbound webhook initiates database transactions, complex stock recalculations, external network queries, or reservation allocations synchronously, provider timeouts cause retries and cascading degradation.

**Rule:** Stages 1–5 execute synchronously with execution times strictly under 50ms. As soon as the raw payload is securely persisted and deduplication is recorded, the HTTP response is sent to the provider. Stages 6–9 are processed asynchronously.

### Invariant 2: Tenant Isolation in Raw Payload Storage
Raw webhook payloads are partitioned per organization tenant in private storage:
```text
${organizationId}/webhooks/${year}/${month}/${eventId}.json
```
Storage operations strictly enforce tenant boundaries. A cross-tenant retrieval request immediately triggers `UnauthorizedStorageAccessError` with HTTP 403 Forbidden.

### Invariant 3: Data Minimization & PII Redaction
Raw webhook payloads from external shopping platforms frequently contain sensitive cardholder or authentication data. The storage pipeline automatically sanitizes:
- Primary Account Numbers (PAN / credit cards) -> masked to `****-****-****-1234`
- Card Verification Values (CVV / CVC / security codes) -> `[REDACTED]`
- Passwords, access tokens, API keys, client secrets -> `[REDACTED]`
- Social Security Numbers / Tax IDs -> `[REDACTED]`

### Invariant 4: Out-of-Order Event Protection
Distributed networks deliver messages out of order. An older event ($T_1$) may arrive after a newer event ($T_2$).
The platform checks entity version and `occurred_at`. If $T_{\text{event}} < T_{\text{entity}}$, the event is identified as out-of-order and dropped from mutating entity state, avoiding data regression.

### Invariant 5: Delayed / Stale Event Handling
Events with timestamps older than the configurable lag threshold (default: 24 hours) are flagged as `isDelayed: true`. Rather than blindly overwriting current balances, a reconciliation run is triggered.

---

## 3. The 9 Canonical Normalized Events (Section 44)

Conforming to Section 44 of `01_ENGINEERING_SPEC.md` and Prompt 18, all incoming events are mapped into the canonical discriminated union `NormalizedEvent`:

| # | Event Type | Description | Primary Payload Fields |
|---|---|---|---|
| 1 | `OrderCreated` | External order placed | `order_id`, `order_number`, `currency`, `total_amount`, `line_items`, `customer`, `shipping_address` |
| 2 | `OrderUpdated` | External order status / fulfillment changed | `order_id`, `order_number`, `status`, `fulfillment_status`, `payment_status` |
| 3 | `OrderCancelled` | Order cancelled by buyer or channel | `order_id`, `order_number`, `reason`, `cancelled_at` |
| 4 | `InventoryChanged` | External channel stock balance changed | `sku`, `quantity`, `location_id`, `fulfillment_channel`, `available`, `on_hand`, `delta` |
| 5 | `ProductChanged` | Catalog product or variant updated | `product_id`, `title`, `status`, `variants` (`variant_id`, `sku`, `price`) |
| 6 | `ListingChanged` | Channel listing or price modified | `listing_id`, `sku`, `status`, `price`, `channel_product_id` |
| 7 | `ReturnCreated` | Return or refund initiated | `return_id`, `order_id`, `status`, `reason`, `items` |
| 8 | `ReturnUpdated` | Return processing or receipt update | `return_id`, `order_id`, `status`, `received_items` |
| 9 | `IntegrationChanged` | Channel health / app status update | `action` (`UNINSTALLED`, `CONNECTED`, `DEGRADED`), `status`, `reason` |

### Mandatory Event Structure
Every normalized event conforms to `BaseNormalizedEvent` containing:
- `event_id`: Unique platform UUID
- `organization_id`: Tenant identifier
- `provider`: Provider code (`SHOPIFY`, `AMAZON`, `EBAY`, `WALMART`)
- `provider_account_id`: Channel account identifier
- `provider_event_id`: Upstream event ID
- `event_type`: One of the 9 canonical types above
- `occurred_at`: ISO-8601 timestamp when the event occurred on the provider
- `received_at`: ISO-8601 timestamp when received by our gateway
- `payload`: Structured, typed event payload
- `correlation_id`: Distributed tracing UUID

---

## 4. Key Subsystem Components

### 1. `RawWebhookStorageService` (`packages/integrations/src/webhooks/raw-storage.ts`)
- Manages encrypted persistence in Supabase Storage or server-side private bucket.
- Enforces payload size limit (default: 5MB; throws `PayloadTooLargeError` HTTP 413).
- Implements automated retention policy (default: 30 days) and lifecycle pruning (`cleanupExpiredWebhooks()`).
- Integrates `@platform/security` redaction before storage write.

### 2. `WebhookDeduplicationStore` (`packages/integrations/src/webhooks/deduplicator.ts`)
- Prevents duplicate domain processing by indexing `(provider, provider_account_id, provider_event_id)`.
- Caches initial fast acknowledgement response with TTL.
- Provider retries immediately receive the cached HTTP 200 response without re-executing domain actions.

### 3. `WebhookNormalizer` (`packages/integrations/src/webhooks/normalizer.ts`)
- Translates provider-specific webhook formats (Shopify REST/GraphQL webhooks, Amazon SQS/SNS/EventBridge envelopes) into canonical `NormalizedEvent` structures.
- Detects unparseable or malformed payloads and raises `MalformedPayloadError` with HTTP 400 Bad Request.

### 4. `WebhookIngestionPipeline` (`packages/integrations/src/webhooks/pipeline.ts`)
- Orchestrates the 9 stages end-to-end.
- Supports pluggable signature verifiers (e.g. Shopify HMAC-SHA256, Amazon SNS signing).
- Connects domain dispatchers (`applyOrderCreated`, `applyInventoryChanged`, etc.) with out-of-order version guards.
- Hooks into downstream reconciliation and sync broadcasts.

---

## 5. Verification Matrix (Prompt 18)

| Gate | Acceptance Scenario | Verification Result |
|---|---|---|
| **Fast Acknowledgement** | Ingestion pipeline returns HTTP 200/202 in < 50ms before long-running domain work | **PASS** (verified in test) |
| **Signature Verification** | Cryptographic verification passes on valid HMAC; invalid signatures return HTTP 401 | **PASS** (verified in test) |
| **Raw Storage Partitioning** | Path `${orgId}/webhooks/${year}/${month}/${eventId}.json` strictly isolates tenants | **PASS** (verified in test) |
| **Cross-Tenant Security** | Cross-tenant access rejected with `UnauthorizedStorageAccessError` (HTTP 403) | **PASS** (verified in test) |
| **PII / PAN Redaction** | Credit cards masked (`****-1234`), tokens, CVV, and passwords replaced with `[REDACTED]` | **PASS** (verified in test) |
| **Payload Size Limit** | Payloads > 5MB rejected with `PayloadTooLargeError` (HTTP 413) | **PASS** (verified in test) |
| **Retention Policy** | Expiration dates assigned; `cleanupExpiredWebhooks()` deletes expired records | **PASS** (verified in test) |
| **Duplicate Webhooks** | Duplicate `provider_event_id` returns `DUPLICATE` ack without re-mutating domain | **PASS** (verified in test) |
| **Provider Retries** | Retried requests return cached acknowledgement immediately | **PASS** (verified in test) |
| **Out-of-Order Events** | Older event ($T_1 < T_2$) is flagged `isOutOfOrder: true` and dropped | **PASS** (verified in test) |
| **Delayed Events** | Events exceeding lag threshold trigger reconciliation run | **PASS** (verified in test) |
| **Malformed Payloads** | Malformed JSON and empty bodies rejected with HTTP 400 Bad Request | **PASS** (verified in test) |
| **9 Normalized Events** | All 9 canonical types tested and validated with mandatory properties | **PASS** (verified in test) |
| **Sync / Recon Trigger** | Inventory/Order events trigger downstream sync and reconciliation triggers | **PASS** (verified in test) |
