# Amazon Outbound Synchronization and Read-Back Verification Architecture

## 1. System Overview

This document specifies the technical architecture, invariants, and implementation of **Phase 16: Amazon Verification** (Prompt 17) for the Multichannel Inventory Control Platform.

The Amazon Verification subsystem connects Amazon Selling Partner API (SP-API) to the generic synchronization and verification framework (`SyncEngine`), governing the lifecycle of outbound inventory mutations, asynchronous submission acknowledgements, read-back verifications, throttling-aware retries, and notification-assisted reconciliation.

```
+-----------------------------------------------------------------------------------+
|                           CANONICAL VERIFICATION LIFECYCLE                        |
|                                                                                   |
|  [ Internal Ledger ]                                                             |
|           |                                                                       |
|           v                                                                       |
|  [ 1. QUEUED (SyncEngine) ]                                                      |
|           |                                                                       |
|           v                                                                       |
|  [ 2. PROCESSING ]  ----(Section 39 FBA Push?)--------> [ REQUIRES_ACTION (Fail) ]|
|           |                                                                       |
|           v                                                                       |
|  [ 3. SENT (REQUEST_SUBMITTED) ]                                                 |
|           |                                                                       |
|           v                                                                       |
|  [ 4. ACKNOWLEDGED (REQUEST_ACKNOWLEDGED) ]  <-- INVARIANT: NEVER MARK VERIFIED!  |
|           |                                                                       |
|           v                                                                       |
|  [ 5. VERIFYING (VERIFICATION_PENDING) ]                                         |
|      /         \                                                                  |
|     /           \                                                                 |
|  (Direct Query) (SQS Notification)                                                |
|    |               |                                                              |
|    +-------+-------+                                                              |
|            |                                                                      |
|            +---> Matches Target? -------------> [ 6. VERIFIED (Green Success) ]  |
|            |                                                                      |
|            +---> Quantity Mismatch? -----------> [ 7. CONFLICT (Domain Exception)]|
|            |                                                                      |
|            +---> Propagation Delay? -----------> [ 8. WEAKER STATE (Pending) ]    |
|            |                                                                      |
|            +---> Transient 503 / 429 Throttle -> [ 9. RETRYING (Backoff/Jitter) ] |
|            |                                                                      |
|            +---> Auth 401 / 403 / Invalid -----> [ 10. REQUIRES_ACTION (Alert) ]  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Invariants & Mandatory Rules

### Invariant 1: Never Represent Acknowledgement as Verification
When Amazon SP-API accepts a Listings Items update (`PATCH /listings/2021-08-01/items/{sellerId}/{sku}`) with HTTP 200/202 and a `submissionId`, the platform records:
- Job status: `ACKNOWLEDGED`
- Verification stage: `REQUEST_ACKNOWLEDGED`
- `isSuccess`: `false`
- `isTerminal`: `false`
- `trustState`: `UNKNOWN`

An accepted write submission is **never** presented as verified. Verification requires explicit confirmation through subsequent read-back verification or validated asynchronous notification.

### Invariant 2: Quantity Discrepancy Gate (CONFLICT)
If Amazon reports an actual inventory level different from the target quantity:
- Job transitions directly to `CONFLICT`.
- Verification stage: `CONFLICT`.
- `isSuccess` **MUST** be `false`. Under no circumstances may a green success state be produced.
- A `DomainException` (`type: SYNC_FAILURE`, `code: QUANTITY_MISMATCH_CONFLICT`) is recorded for operator review and reconciliation.

### Invariant 3: Section 39 Fulfillment Channel Isolation
Direct merchant inventory pushes cannot mutate Amazon FBA balances:
- Pushing inventory targeting `FBA` throws a `ProviderValidationError` and immediately transitions the sync job to `REQUIRES_ACTION`.
- Merchant-fulfilled (MFN / `DEFAULT`) inventory is updated via Listings Items API.
- FBA inventory levels are inspected read-only via FBA Inventory Summaries API (`/fba/inventory/v1/summaries`).

### Invariant 4: Delayed Verification & Weaker Verification State
Amazon catalog updates can experience asynchronous propagation delays:
- When `allowDelayedVerification: true` and an immediate read-back returns previous values within the propagation window:
  - Job status remains `VERIFYING`.
  - Verification stage: `VERIFICATION_PENDING`.
  - `isSuccess`: `false`.
  - `isConflict`: `false`.
  - `isDelayedVerification`: `true`.
  - `verified_at`: `null`.
  - Freshness display: `"Update acknowledged by Amazon (submission ${id}); verification pending propagation."`

### Invariant 5: Notification-Assisted Verification (Avoiding Aggressive Polling)
Amazon SP-API notifications via AWS SQS / EventBridge (`LISTINGS_ITEM_STATUS_CHANGE`, `FBA_INVENTORY_AVAILABILITY_CHANGE`) are ingested and deduplicated:
- When a verified notification arrives with matching inventory quantity, the sync job transitions directly to `VERIFIED` without polling SP-API endpoints.
- If the notification reports a discrepancy, the job transitions to `CONFLICT`.
- The `awaitNotificationOrReadBack` method races between asynchronous notification arrival and direct query fallback.

---

## 3. Component Architecture

### 3.1 `AmazonVerificationPipeline`
Located in `packages/integrations/src/providers/amazon/amazon-verification.ts`.

Implements the high-level orchestration across `SyncEngine`, `SyncJobService`, and `AmazonAdapter`:
- `syncAndVerify(params)`: Executes complete outbound push and read-back verification lifecycle.
- `verifyViaNotification(params)`: Resolves verification via incoming SQS notification.
- `awaitNotificationOrReadBack(params, options)`: Waits for notification or falls back to direct query.
- `verifyCurrentInventory(sku, expectedQuantity, options)`: Direct read-back verification against Amazon.
- `inspectFreshness(sku, maxStalenessMs, options)`: Freshness inspection returning `TrustState`.
- `formatFreshness(timestamp, now, label)`: Formats Section 121 human-readable strings.

### 3.2 Error Classification & Escalation Lifecycle

| Raw Error Condition | HTTP Status | Canonical Classification | Resulting Job State | Verification Stage | Retryable? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `RequestThrottled` / `QuotaExceeded` | 429 | `RATE_LIMIT` | `RETRYING` | `VERIFICATION_PENDING` | Yes (backoff with header) |
| Service Unavailable / Gateway Timeout | 503, 504 | `TRANSIENT` | `RETRYING` | `VERIFICATION_PENDING` | Yes (up to `maxAttempts`) |
| Connection Timeout (`ETIMEDOUT`) | N/A | `TRANSIENT` | `RETRYING` | `VERIFICATION_PENDING` | Yes |
| Unauthorized / Invalid Refresh Token | 401, 403 | `AUTHENTICATION` | `REQUIRES_ACTION` | `FAILED` | No (requires credential action) |
| Invalid SKU / Schema Validation | 400, 422 | `VALIDATION` | `REQUIRES_ACTION` | `FAILED` | No |
| Section 39 Direct FBA Push | 400 | `VALIDATION` | `REQUIRES_ACTION` | `FAILED` | No |
| Quantity Mismatch on Read-back | 409 | `CONFLICT` | `CONFLICT` | `CONFLICT` | No (requires reconciliation) |

---

## 4. Freshness Semantics (Section 121 Conformance)

The pipeline captures and propagates explicit timestamps on every verification operation:
- `observed_at`: Exact timestamp when Amazon reported the inventory level.
- `received_at`: Exact timestamp when the platform ingested the external observation.
- `verified_at`: Timestamp when read-back verification succeeded (`null` in unverified, delayed, or conflict states).

### Human-Readable Formatting
Conforming to Section 121 and `02_PRODUCT_DESIGN_SPEC.md`:
- `< 60s`: `"Last verified 42 seconds ago."`
- `< 60m`: `"Observed 3 minutes ago."`
- `< 24h`: `"Observed 2 hours ago."`
- `>= 24h`: `"Observed 1 day ago."`

---

## 5. Verification Evidence

Acceptance test suite: `tests/phase16-amazon-verification.test.ts` (17/17 tests passing):
- Outbound update flow & canonical progression: `VERIFIED`.
- Never represent acknowledgement as verification: `VERIFIED`.
- Delayed verification & weaker verification state: `VERIFIED`.
- Conflicting read-back (discrepancy gate): `VERIFIED`.
- Read-back timeout handling: `VERIFIED`.
- Retry behavior & transient failures: `VERIFIED`.
- Rate limit & throttling handling (HTTP 429): `VERIFIED`.
- Authentication failure handling (`REQUIRES_ACTION`): `VERIFIED`.
- Section 39 Fulfillment Channel Isolation: `VERIFIED`.
- Notification-assisted verification: `VERIFIED`.
- Freshness timestamps & display formatting: `VERIFIED`.
- Multi-tenant isolation enforcement: `VERIFIED`.
