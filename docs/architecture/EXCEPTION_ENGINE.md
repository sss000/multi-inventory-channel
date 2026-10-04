# Exception Management Subsystem Architecture & Specification

## 1. Overview & Authority
The Exception Management Subsystem is the platform's central failure-handling, anomaly-investigation, and operator-action framework. It captures, scores, contextualizes, and tracks operational discrepancies across inventory mutations, synchronization pipelines, external marketplace integrations, order imports, and catalog mappings.

**Governing Specifications:**
- `specifications/01_ENGINEERING_SPEC.md` (Sections 32, 33, 34, 52)
- `specifications/03_FRONTEND_SPEC.md` (Lines 1160–1195)
- `specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md` (Prompt 20: Phase 19 — Exception Engine)
- Current Canonical Lifecycle State: `VERIFIED`

---

## 2. All 11 Canonical Exception Types

Every detected issue is converted into a structured `DomainException` matching one of the 11 canonical types:

| Exception Type | Default Severity | Automatable? | Description |
| :--- | :---: | :---: | :--- |
| `NEGATIVE_INVENTORY` | `CRITICAL` | No | Inventory balance dropped below zero; indicates physical recount or overselling failure. |
| `PROVIDER_OUTAGE` | `CRITICAL` | Yes | External marketplace API is down or unreachable (HTTP 502/503/504). |
| `AUTHENTICATION_FAILURE` | `HIGH` | No | OAuth token expired, revoked, or API keys invalid on channel account. |
| `SYNC_FAILURE` | `HIGH` | Contextual | Outbound synchronization job failed during delivery or acknowledgment. |
| `INVENTORY_MISMATCH` | `HIGH` / `MEDIUM` | Contextual | Divergence between internal ledger and channel count detected during audit. |
| `DUPLICATE_MAPPING` | `HIGH` | No | Multiple internal SKUs or external listings mapped to the same channel identifier. |
| `ORDER_IMPORT_FAILURE` | `HIGH` | No | Inbound order failed validation, customer mapping, or persistence constraints. |
| `MISSING_MAPPING` | `MEDIUM` | No | Channel SKU cannot be linked to any active internal catalog SKU. |
| `ORDER_UNMAPPED_SKU` | `MEDIUM` | No | Order line item contains an unmapped SKU; held in exception to prevent wrong stock deductions. |
| `RATE_LIMIT` | `LOW` | Yes | Channel API returned HTTP 429 throttling; system applies Retry-After backoff. |
| `STALE_DATA` | `LOW` | Yes | External snapshot age exceeds freshness SLA; read-back queued. |

---

## 3. Deterministic & Dynamic Severity Scoring

The engine enforces deterministic default severity rankings:
- `CRITICAL`: Issues threatening financial loss, legal overselling, or total channel unavailability (`NEGATIVE_INVENTORY`, `PROVIDER_OUTAGE`).
- `HIGH`: Authentication failures, duplicate mapping collisions, order import failures, and large sync divergences.
- `MEDIUM`: Unmapped SKUs or line items that require human catalog intervention.
- `LOW`: Transient throttling, rate limits, and snapshot staleness.

### Dynamic Severity Elevation Rules
1. **Financial Impact**: Any exception involving an order, batch, or SKU with estimated financial impact $\ge \$5,000$ is automatically elevated to `CRITICAL`.
2. **Negative Balance Magnitude**: Negative quantity delta with $|\Delta| \ge 50$ units elevates to `CRITICAL`.
3. **Repeated Failures**: Successive failures on the same entity elevate the base severity by one tier (`LOW` $\to$ `MEDIUM` $\to$ `HIGH` $\to$ `CRITICAL`).

---

## 4. The 6 Mandatory Diagnostic Questions (Section 34 & Prompt 20)

Every exception must contain sufficient structured evidence to answer:

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. WHAT HAPPENED?                                           │
│    Clear description of the observed operational failure    │
├─────────────────────────────────────────────────────────────┤
│ 2. WHY?                                                     │
│    Underlying root cause, error code, and context           │
├─────────────────────────────────────────────────────────────┤
│ 3. WHAT IS AFFECTED?                                        │
│    Impacted SKUs, orders, channels, and business processes  │
├─────────────────────────────────────────────────────────────┤
│ 4. WHAT DID THE SYSTEM TRY?                                 │
│    Automated retries, circuit breaking, fallback states     │
├─────────────────────────────────────────────────────────────┤
│ 5. WHAT HAPPENS NEXT?                                       │
│    Scheduled retry windows, queue holds, supervisor alerts  │
├─────────────────────────────────────────────────────────────┤
│ 6. WHAT CAN I DO?                                           │
│    Concrete, actionable steps for the human operator        │
└─────────────────────────────────────────────────────────────┘
```

The system recommendation is explicitly labeled as `systemRecommendation` (not presented as an immutable fact when it is an inference).

---

## 5. Exception Lifecycle State Machine (Section 33)

```
        ┌──────────────┐
        │     OPEN     ├──────────────────────────┐
        └──────┬───────┘                          │
               │                                  │
               ▼                                  │
      ┌─────────────────┐                         │
      │  INVESTIGATING  │                         │
      └────────┬────────┘                         │
               │                                  │
               ▼                                  │
     ┌───────────────────┐                        ▼
     │  ACTION_REQUIRED  │                  ┌───────────┐
     └─────────┬─────────┘                  │  IGNORED  │
               │                            └─────┬─────┘
               ▼                                  │ (Reopen)
        ┌─────────────┐                           │
        │  RESOLVING  │                           │
        └──────┬──────┘                           │
               │                                  │
               ▼                                  │
        ┌─────────────┐                           │
        │  RESOLVED   │◄──────────────────────────┘
        └─────────────┘
```

### State Transitions
1. `OPEN` $\to$ `INVESTIGATING` $\to$ `ACTION_REQUIRED` $\to$ `RESOLVING` $\to$ `RESOLVED`
2. `OPEN` $\to$ `IGNORED` (Ignored exceptions must retain an audit record per Section 33).
3. Reopening: `RESOLVED` $\to$ `OPEN` and `IGNORED` $\to$ `OPEN`.
4. Illegal transitions (e.g. `RESOLVED` directly to `ACTION_REQUIRED` without reopening) are rejected with `InvalidStateTransitionError`.

---

## 6. Critical Invariant: Retry Submission Rule (Prompt 20)

> **MANDATORY SPECIFICATION RULE:**
> *"Do not mark an exception RESOLVED merely because a retry was submitted; the underlying condition must actually be resolved or explicitly classified according to the exception policy."*

When an operator or system initiates a retry (`POST /exceptions/:id/retry` or `exceptionEngine.retryException`):
- The status transitions strictly to `RESOLVING`.
- `resolved_at` and `resolved_by` remain `null`.
- Only when subsequent read-back verification or the background retry worker confirms that the underlying issue is fixed may the exception transition to `RESOLVED` (via `autoResolveException` or manual resolution).

---

## 7. Audit Trail Enforcement (Prompt 20 & Section 52)

Every mutation creates an append-only audit record in `audit_logs`:
- `id` (UUID)
- `organization_id` (UUID)
- `actor_type` (`USER`, `SYSTEM`, `WEBHOOK`, `CHANNEL`)
- `actor_id` (UUID)
- `action` (`EXCEPTION_CREATED`, `EXCEPTION_RESOLVED`, `EXCEPTION_IGNORED`, `EXCEPTION_RETRY_SUBMITTED`, `EXCEPTION_RECONCILE_SUBMITTED`)
- `entity_type` (`EXCEPTION`)
- `entity_id` (UUID)
- `before_state` & `after_state` (JSONB)
- `reason` (text)
- `correlation_id` (UUID)
- `created_at` (TIMESTAMPTZ)

---

## 8. Section 52 REST API Endpoints & RBAC

All endpoints enforce multi-tenant isolation and session tokens:

| Method | Path | Required Permission | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/exceptions` | `exceptions:read` | Lists exceptions with pagination, status, severity, and type filters. |
| `GET` | `/exceptions/:id` | `exceptions:read` | Retrieves full exception details with all 6 diagnostic questions and evidence. |
| `POST` | `/exceptions/:id/resolve` | `exceptions:resolve` | Resolves exception; records resolution notes and audit record. |
| `POST` | `/exceptions/:id/retry` | `exceptions:resolve` | Submits retry; transitions status to `RESOLVING` and creates audit record. |
| `POST` | `/exceptions/:id/ignore` | `exceptions:resolve` | Ignores exception with reason; creates audit record. |
| `POST` | `/exceptions/:id/reconcile` | `exceptions:resolve` | Triggers discrepancy reconciliation; transitions status to `RESOLVING`. |

Role Matrix:
- `OWNER`, `ADMIN`, `MANAGER`, `OPERATOR`: Have both `exceptions:read` and `exceptions:resolve`.
- `VIEWER`: Has `exceptions:read` only. Any mutation attempt returns HTTP 403 `FORBIDDEN`.
- Cross-tenant requests return HTTP 403 `FORBIDDEN`.
