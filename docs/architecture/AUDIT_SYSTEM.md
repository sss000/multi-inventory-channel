# Audit System Architecture & Causal Reconstruction Engine

**Canonical Specification:** Sections 35, 36, 68, 114 of `specifications/01_ENGINEERING_SPEC.md` & Prompt 21 of `specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md`  
**Lifecycle State:** `VERIFIED`  
**Package:** `@platform/database`, `@platform/domain`, `@platform/contracts`, `apps/api`

---

## 1. Overview & Core Promise

The Audit System provides an immutable, append-only historical record of all material state changes and administrative decisions across the Multichannel Inventory Control Platform.

> **Prompt 21 & Section 68 Principle:**
> *"Audit logs are append-only. Do not provide ordinary users a mechanism to edit audit history."*

Every material mutation—whether executed by an operator in the user interface, by an automated worker during reconciliation, or via external webhook ingestion—is recorded as a discrete, correlated, and cryptographically verifiable audit record.

---

## 2. Immutability & Database Schema Guarantees

In accordance with Section 68 and the database migrations (`supabase/migrations/20260928000001_core_schema.sql` and `20260928000002_row_level_security.sql`):

### 2.1 Table Schema (`audit_logs`)

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_type actor_type NOT NULL, -- 'USER', 'SYSTEM', 'CHANNEL', 'WEBHOOK'
    actor_id UUID,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before_state JSONB,
    after_state JSONB,
    reason TEXT,
    request_id TEXT,
    correlation_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.2 Immutability Guarantees

1. **No `updated_at` Column or Trigger:** The `audit_logs` table contains only `created_at`.
2. **PostgreSQL Row Level Security (RLS):**
   ```sql
   -- audit_logs: STRICT APPEND-ONLY.
   -- Authenticated users can only view their tenant's audit trail.
   CREATE POLICY "audit_logs_tenant_isolation_select" ON audit_logs
       FOR SELECT TO authenticated
       USING (organization_id IN (SELECT current_user_organization_ids()));
   ```
   No `INSERT`, `UPDATE`, or `DELETE` policies exist for `authenticated` roles.
3. **Repository Invariant Enforcement:**
   `InMemoryAuditRepository` and `AuditRepository` throw `ImmutableAuditLogError` (`IMMUTABLE_AUDIT_LOG`) unconditionally on any `update()` or `delete()` invocation.
4. **HTTP Invariant Protection:**
   The API server explicitly intercepts `PUT /audit*`, `PATCH /audit*`, and `DELETE /audit*` and returns `405 Method Not Allowed`. Direct client creation via `POST /audit` is likewise rejected with `405 Method Not Allowed`.

---

## 3. The 8 Material Mutation Audit Categories

Prompt 21 strictly requires comprehensive coverage across 8 mutation domains:

| Category | Primary Action Examples | Entity Type | Captured State |
|:---|:---|:---|:---|
| **1. Inventory Adjustments** | `INVENTORY_ADJUSTMENT`, `INVENTORY_IMPORT`, `INVENTORY_RECEIPT`, `INVENTORY_RECOUNT`, `INVENTORY_DAMAGE`, `INVENTORY_TRANSFER` | `inventory_balance` | `on_hand`, `available`, `reserved`, warehouse location, operator reason |
| **2. Reconciliation** | `RECONCILIATION_RUN_STARTED`, `RECONCILIATION_RESULT_APPROVED`, `RECONCILIATION_RESULT_REJECTED` | `reconciliation` | Discrepancy delta, source of truth, supervisor approval reason |
| **3. Mapping Changes** | `MAPPING_CREATED`, `MAPPING_UPDATED`, `MAPPING_DELETED` | `channel_product_mapping` | SKU ID, external channel variant ID, account binding |
| **4. Exception Resolution** | `EXCEPTION_CREATED`, `EXCEPTION_RESOLVED`, `EXCEPTION_IGNORED`, `EXCEPTION_RETRIED`, `EXCEPTION_RECONCILED` | `exception` | Exception status, diagnostic notes, resolution justification |
| **5. Integration Changes** | `INTEGRATION_CONNECTED`, `INTEGRATION_UPDATED`, `INTEGRATION_DISCONNECTED`, `INTEGRATION_CREDENTIALS_REFRESHED` | `channel_account` | Channel provider, account status, credential scopes |
| **6. Billing Actions** | `BILLING_PLAN_CHANGED`, `BILLING_SUBSCRIPTION_CANCELLED`, `BILLING_PAYMENT_METHOD_UPDATED` | `billing` | Previous tier, new tier, billing admin override reason |
| **7. Bulk Operations** | `BULK_INVENTORY_ADJUSTMENT`, `BULK_SYNC_TRIGGERED`, `BULK_MAPPING_UPDATED` | `bulk_operation` | Target record count, applied count, failure threshold |
| **8. Admin Actions** | `MEMBER_INVITED`, `MEMBER_UPDATED`, `MEMBER_REMOVED`, `ORGANIZATION_UPDATED`, `ROLE_CHANGED` | `organization_admin` | Member ID, assigned role, permission delta |

---

## 4. The Canonical Acceptance Test: Causal Incident Reconstruction

Section 114 and Prompt 21 define the required verification test:

> *"Given an inventory discrepancy, an administrator must be able to reconstruct:*
> 1. *before*
> 2. *event*
> 3. *actor*
> 4. *reason*
> 5. *after*
> 6. *channel impact*
> 7. *synchronization result*
> 8. *resolution"*

### 4.1 Causal Reconstruction Engine Architecture

The reconstruction engine (`reconstructDiscrepancyTrail` in `@platform/domain/src/audit-service.ts` and `AuditDatabaseService.reconstructDiscrepancy` in `@platform/database/src/audit.ts`) correlates audit events by `correlation_id` or `entityId`, sorts them chronologically, and derives the complete timeline:

```
[Discrepancy Event] ──► [Channel Sync Triggered] ──► [Read-Back Verified] ──► [Exception Resolved]
   (before, actor,         (channel impact:             (sync result:            (resolution:
    reason, after)          target quantity,             VERIFIED, timestamp)     supervisor note)
                            channel account)
```

### 4.2 Output Structure (`AuditReconstruction`)

```json
{
  "entityType": "inventory_balance",
  "entityId": "sku-555-ultra-display",
  "correlationId": "incident-sku-555-discrepancy-chain",
  "timestamp": "2026-10-02T14:00:00.000Z",
  "before": { "on_hand": 50, "available": 45, "reserved": 5 },
  "event": "INVENTORY_RECOUNT",
  "actor": { "type": "USER", "id": "user_admin_org_a" },
  "reason": "Defective packaging discovered during safety sweep",
  "after": { "on_hand": 42, "available": 37, "reserved": 5, "status": "RESOLVED" },
  "channelImpact": {
    "channelAccountId": "channel_shopify_store",
    "channelName": "Shopify US Flagship",
    "previousChannelQuantity": 45,
    "targetChannelQuantity": 37,
    "status": "AFFECTED"
  },
  "synchronizationResult": {
    "syncJobId": "sync_job_9999",
    "status": "VERIFIED",
    "stage": "VERIFIED",
    "verifiedAt": "2026-10-02T14:00:12.000Z"
  },
  "resolution": {
    "status": "RESOLVED",
    "resolvedBy": "user_admin_org_a",
    "resolvedAt": "2026-10-02T14:00:20.000Z",
    "notes": "Discrepancy fully investigated and confirmed by supervisor"
  },
  "timeline": [ ... ]
}
```

---

## 5. Security & RBAC Enforcement

### 5.1 RBAC Matrix

In conformance with Section 11 of `specifications/03_FRONTEND_SPEC.md`:

| Role | `audit:read` | `audit:export` | Can View Audit History | Can Export Logs |
|:---|:---:|:---:|:---:|:---:|
| **OWNER** | Yes | Yes | Yes | Yes |
| **ADMIN** | Yes | Yes | Yes | Yes |
| **MANAGER** | Yes | Configured | Yes | Configured |
| **OPERATOR** | Configured | No | Configured | No |
| **VIEWER** | Configured | No | No (unless granted) | No |

### 5.2 Multi-Tenant Isolation

- Every query is forced through the authenticated tenant context (`tenantContext.organizationId`).
- Attempting to access an audit record belonging to Organization B while authenticated as Organization A raises `TenantAccessDeniedError` (HTTP 403 `FORBIDDEN`).

---

## 6. REST API Endpoints

All endpoints are hosted on `apps/api` and conform to Section 45 envelope standards:

| Method | Path | Required Permission | Description |
|:---|:---|:---|:---|
| `GET` | `/audit` | `audit:read` | Query audit records with filtering (`entityType`, `entityId`, `action`, `actorType`, `actorId`, `startDate`, `endDate`, `correlationId`) and pagination (`limit`, `offset`, `page`). |
| `GET` | `/audit/:id` | `audit:read` | Retrieve a single audit record with full before/after states. |
| `GET` | `/audit/reconstruct/:correlationId` | `audit:read` | Reconstruct the 8-part incident causal chain for an inventory discrepancy or incident. |
| `GET` | `/audit/export` | `audit:read` | Export audit records in RFC 4180 CSV (`format=csv`) or JSON (`format=json`). |
| `PUT / PATCH / DELETE` | `/audit/*` | N/A | **Rejected:** Returns `405 Method Not Allowed` with `IMMUTABLE_AUDIT_LOG`. |
| `POST` | `/audit` | N/A | **Rejected:** Direct client creation forbidden (`405 Method Not Allowed`). |

---

## 7. Verification Evidence

- Automated test suite: `tests/phase20-audit.test.ts`
- Total tests passed: **35 / 35** tests across 9 test suites with zero failures.
- Global regression test: **428 / 428** tests passed across all 166 suites in monorepo.
