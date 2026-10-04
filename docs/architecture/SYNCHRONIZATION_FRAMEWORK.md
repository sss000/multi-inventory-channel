# Synchronization Framework Architecture & Specification

## 1. Overview & Authority
The Synchronization Framework is the platform's provider-independent outbound inventory synchronization engine. It governs the lifecycle of every inventory mutation dispatched to external sales channels (Shopify, Amazon, eBay, Walmart).

**Governing Specifications:**
- `specifications/01_ENGINEERING_SPEC.md` (Sections 23, 24, 25, 26)
- `specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md` (Prompt 12: Phase 11 — Synchronization Framework)
- Current Canonical Lifecycle State: `VERIFIED`

---

## 2. Canonical State Machine & Lifecycles

Outbound inventory synchronization follows a strict asynchronous 6-stage forward progression and 4 failure states:

```
[QUEUED]
   │
   ▼
[PROCESSING] ──────────────────────────┐
   │                                   │
   ▼                                   │
[SENT] ──────────────────────────┐     │
   │                             │     │
   ▼                             ▼     ▼
[ACKNOWLEDGED] ──────────────► [RETRYING] (transient/rate limit)
   │                             │
   ▼                             ▼ (attempts >= maxAttempts)
[VERIFYING]                   [FAILED]
   │    │
   │    ├────────────────────► [CONFLICT] (quantity mismatch/discrepancy)
   │    │
   │    └────────────────────► [REQUIRES_ACTION] (auth/validation/not found)
   ▼
[VERIFIED]
```

### Forward States
1. **QUEUED**: Mutation request recorded in database with unique idempotency key; awaiting worker pickup.
2. **PROCESSING**: Worker thread has claimed job; timestamp `started_at` recorded.
3. **SENT**: Outbound payload dispatched over wire to external channel endpoint; timestamp `sent_at` recorded.
4. **ACKNOWLEDGED**: External channel HTTP endpoint accepted request (HTTP 200/202/transaction ID returned); timestamp `acknowledged_at` recorded.
5. **VERIFYING**: Engine is actively performing read-back verification against the external channel.
6. **VERIFIED**: External channel read-back confirms target inventory level matches physical stock; timestamp `verified_at` recorded.

### Terminal & Failure States
1. **RETRYING**: Transient error or rate-limit encountered; scheduled for exponential backoff + jitter retry.
2. **FAILED**: Maximum retry attempts exhausted or non-recoverable terminal error.
3. **REQUIRES_ACTION**: Configuration, credential, or schema error (e.g. invalid OAuth token, unmapped SKU, missing listing) requiring operator intervention.
4. **CONFLICT**: External channel state contradicts internal ledger; discrepancy detected, triggering reconciliation.

---

## 3. Mandatory Read-Back Verification Invariant Gate

### The Core Invariant
> **A synchronization job must NEVER be marked `VERIFIED` solely because an outbound HTTP/API operation succeeded.**

External marketplaces are asynchronous and distributed:
- Shopify inventory levels can be throttled or modified by concurrent point-of-sale systems.
- Amazon SP-API feed submissions return HTTP 200 on receipt of feed document, but asynchronous feed processing may subsequently fail or reject line items.
- eBay and Walmart inventory updates often suffer internal event processing lags.

### Enforced Protection
- When an outbound push succeeds, the job transitions only to `ACKNOWLEDGED`.
- Transitioning directly from `QUEUED`, `PROCESSING`, `SENT`, or `ACKNOWLEDGED` to `VERIFIED` is strictly prohibited by domain validation and throws `InvalidStateTransitionError`.
- The engine must transition to `VERIFYING` and invoke `ChannelAdapter.verifyInventoryLevel`.
- If client timeout occurs during read-back verification (Scenario: *provider accepted request followed by client timeout*), the job transitions to `RETRYING`, **never** `VERIFIED`.

---

## 4. Error Classification Taxonomy (Prompt 12)

Every caught error and external response is parsed through `classifySyncError`:

| Classification | HTTP Status / Codes | Retryable? | Target State | Operator Action / Remediation |
| :--- | :--- | :---: | :--- | :--- |
| **TRANSIENT** | 408, 500, 502, 503, 504, `ETIMEDOUT`, `ECONNRESET` | Yes | `RETRYING` | Automatic exponential backoff + uniform jitter retry. |
| **RATE_LIMIT** | 429, `RATE_LIMIT_EXCEEDED`, `Throttling` | Yes | `RETRYING` | Respected `retry-after` header delay + backoff. |
| **AUTHENTICATION** | 401, 403, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED` | No | `REQUIRES_ACTION` | No blind retry. Emits domain exception to refresh credentials in Settings. |
| **VALIDATION** | 400, 422, `VALIDATION_FAILED`, `MALFORMED_PAYLOAD` | No | `REQUIRES_ACTION` | Payload rejected. Emits domain exception to correct invalid parameters. |
| **NOT_FOUND** | 404, `RESOURCE_NOT_FOUND`, `UNKNOWN_SKU` | No | `REQUIRES_ACTION` | External SKU/listing absent. Emits exception to review channel mapping. |
| **CONFLICT** | 409, `QUANTITY_MISMATCH_CONFLICT`, `VERSION_CONFLICT` | No | `CONFLICT` | Observed quantity does not match target. Emits exception to run reconciliation. |
| **UNKNOWN** | Unrecognized error | Yes (initial) | `RETRYING` / `FAILED` | Conservative retry, then escalates to `FAILED`. |

---

## 5. Idempotency & Deduplication
To prevent duplicate outbound transmissions and race conditions:
1. Every sync job requires an idempotency key:
   $$\text{Idempotency Key} = \text{orgId}:\text{channelAccountId}:\text{skuId}:\text{inventoryVersion}$$
2. Re-enqueueing a job with an identical key within the same organization returns `{ job: existing, isDuplicate: true }` (HTTP 200 OK) without creating duplicate database rows or duplicate outbound API dispatches.

---

## 6. Tenant Isolation & RBAC
- Multi-tenant isolation is enforced on every operation: cross-tenant access to sync jobs throws `TenantAccessDeniedError` (HTTP 403 Forbidden).
- Read operations require `channels:read`.
- Mutation operations (enqueue, retry) require `channels:sync`.
- `VIEWER` role is strictly forbidden from triggering synchronization mutations.
