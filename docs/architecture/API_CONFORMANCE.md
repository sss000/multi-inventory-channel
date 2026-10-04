# Application API Conformance Architecture

## Canonical Specification Authority
- **Primary:** `specifications/01_ENGINEERING_SPEC.md` (Sections 45–57)
- **Execution Plan:** `specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md` (Prompt 24)
- **Validation Standard:** `specifications/05_VALIDATION_GATE.md` (Gate 24)

---

## 1. Executive Summary

Phase 23 establishes the canonical HTTP API layer of the Multichannel Inventory Control Platform. It harmonizes all 11 core functional domains under a unified, versioned `/api/v1` base path while maintaining seamless, unversioned backward-compatible route aliases. Every endpoint enforces strict multi-tenant isolation, uniform envelope discipline for both successes and errors, comprehensive input validation via Zod, standard pagination rules (default 50, maximum 250), sliding-window rate limiting, and defensive security headers.

---

## 2. API Families & Route Structure

All endpoints are reachable under both `/api/v1/*` and direct unversioned paths:

| API Family | Primary Paths | Key Actions & Invariants |
|---|---|---|
| **1. Auth** | `/api/v1/auth/*`<br>`/auth/*` | Register, login, logout, token refresh, password recovery/reset, session inspection (`/auth/me`). Single identity authority via Supabase Auth. |
| **2. Organizations** | `/api/v1/organizations/*`<br>`/organizations/*` | Server-enforced tenant context (`/organizations/current`), member management, RBAC enforcement (`OWNER`, `ADMIN`, `MANAGER`, `OPERATOR`, `VIEWER`). |
| **3. Products** | `/api/v1/products/*`<br>`/products/*` | Multi-tenant catalog management, variant tracking, barcode, pricing, dimensions, and soft-delete capabilities. |
| **4. Inventory** | `/api/v1/inventory/*`<br>`/inventory/*` | Balances, audit timeline by SKU, manual adjustments, recount reconciliation, and detected channel conflicts. Derived available calculation invariant. |
| **5. Orders** | `/api/v1/orders/*`<br>`/orders/*` | External order ingestion, atomic reservation allocation, cancellation with automatic reservation release, and order events. |
| **6. Integrations** | `/api/v1/integrations/*`<br>`/integrations/*`<br>`/channels/accounts` | OAuth connect flows, health probe evaluation, manual sync triggers, reconnection, and disconnection. |
| **7. Synchronization** | `/api/v1/sync/jobs/*`<br>`/sync-jobs/*` | Asynchronous sync dispatch, BullMQ worker status tracking, retry controls, and filterable job execution telemetry. |
| **8. Reconciliation** | `/api/v1/reconciliation/*`<br>`/reconciliation/*` | Discrepancy detection runs, manual and automatic correction approval/rejection, and ledger sync auditing. |
| **9. Exceptions** | `/api/v1/exceptions/*`<br>`/exceptions/*` | Exception inbox, automated severity scoring, human-in-the-loop diagnostic explanations, resolution, and ignore lifecycles. |
| **10. Audit** | `/api/v1/audit/*`<br>`/audit/*` | Append-only tamper-evident compliance logs, discrepancy reconstruction, JSON/CSV streaming export. HTTP 405 `METHOD_NOT_ALLOWED` on non-GET. |
| **11. Billing & Notifications** | `/api/v1/billing/*`<br>`/api/v1/notifications/*` | Stripe customer portal, subscription management, usage tier metering, in-app notification inbox, unread counts, and preference toggles. |

---

## 3. Uniform Envelope Contracts

### 3.1 Success Envelope
All 2xx responses return a consistent envelope:
```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2026-10-03T19:27:16.000Z",
    "correlationId": "req_1791055564129",
    "requestId": "req_1791055564129",
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 120,
      "offset": 0,
      "hasMore": true,
      "cursor": "...",
      "nextCursor": "..."
    }
  }
}
```

### 3.2 Error Envelope
All error responses return a structured error object without ever leaking raw runtime exceptions or database stack traces:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Limit must be between 1 and 250",
    "correlationId": "req_1791055564129",
    "requestId": "req_1791055564129",
    "details": [ ... ]
  }
}
```

---

## 4. Input & Output Discipline

1. **Pagination Limits:**
   - Default page size: 50 items.
   - Maximum page size: 250 items.
   - Requests with `limit > 250` or non-positive pages are rejected immediately with HTTP 400 `VALIDATION_ERROR`.
   - Both offset (`page`, `offset`) and cursor-based (`cursor`, `nextCursor`) patterns are supported.
2. **Payload Protection:**
   - Incoming request bodies are capped at 1MB. Payloads exceeding this threshold are immediately rejected with HTTP 413 `PAYLOAD_TOO_LARGE`.
3. **JSON Parsing Resilience:**
   - Syntactically invalid or truncated JSON payloads return HTTP 400 `INVALID_JSON`.
4. **Rate Limiting:**
   - High-performance in-memory sliding-window rate limiter tracks requests per IP.
   - Breached limits return HTTP 429 `RATE_LIMITED` with standard `Retry-After`, `X-RateLimit-Limit`, and `X-RateLimit-Remaining` headers.
5. **Security Headers:**
   Every single response emitted by the API includes:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `X-XSS-Protection: 1; mode=block`
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
   - `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`
   - `X-Correlation-Id: <id>`
   - `X-Request-Id: <id>`

---

## 5. HTTP Status Code Taxonomy

- **200 OK:** Successful reads, updates, and idempotent mutations.
- **201 Created:** Successful entity creation (`/products`, `/orders`, `/integrations/:provider/connect`).
- **400 Bad Request:** Validation errors, malformed JSON, invariant violations.
- **401 Unauthorized:** Missing, expired, or invalid session token.
- **403 Forbidden:** RBAC permission denied (e.g. `VIEWER` attempting product mutations).
- **404 Not Found:** Resource not found or non-existent endpoint.
- **405 Method Not Allowed:** Attempting write/delete mutations on immutable resources (e.g. `/audit`).
- **409 Conflict:** State transition conflicts, insufficient inventory, duplicate idempotency keys.
- **413 Payload Too Large:** Body size exceeds 1MB limit.
- **429 Too Many Requests:** Sliding-window rate limit exceeded.
- **500 Internal Server Error:** Opaque, masked internal failure logged to server-side telemetry.

---

## 6. Verification & Automated Testing

Automated test suite [`tests/phase23-api-conformance.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase23-api-conformance.test.ts) provides 100% test coverage for:
- All 11 API families under `/api/v1` and unversioned aliases.
- Security headers and uniform envelopes.
- Status code discipline across all scenarios.
- Strict multi-tenant isolation barriers (Organization A vs. Organization B).
- Sliding-window rate limiting with `Retry-After`.
- Idempotency key deduplication.
